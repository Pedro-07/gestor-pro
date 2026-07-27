-- ============================================================================
-- MIGRATION 003 — RPCs TRANSACIONAIS (atomicidade + trava de estoque)
-- Move as operações críticas (venda, cancelamento, edição, consignação e
-- acerto) para funções no Postgres. Cada função roda numa ÚNICA transação:
-- se qualquer passo falhar, TUDO é revertido (nada de estoque furado ou
-- acerto pela metade). Usa SELECT ... FOR UPDATE para travar o produto e
-- impedir que duas operações simultâneas vendam além do estoque.
--
-- SECURITY INVOKER (padrão): a função executa com as permissões e o RLS do
-- usuário que chamou — só enxerga/altera dados da própria loja (loja_id = auth.uid()).
--
-- Idempotente (CREATE OR REPLACE). Execute no SQL Editor do Supabase.
-- ============================================================================

-- ─── HELPER: aplica um delta ao estoque de um produto (com trava) ────────────
CREATE OR REPLACE FUNCTION _aplicar_delta_estoque(
  p_produto_id UUID, p_tamanho TEXT, p_delta NUMERIC, p_usar_tamanhos BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estoque JSONB;
  v_total NUMERIC;
BEGIN
  SELECT estoque INTO v_estoque FROM produtos WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_usar_tamanhos THEN
    v_estoque := jsonb_set(v_estoque, ARRAY[p_tamanho],
      to_jsonb(COALESCE((v_estoque->>p_tamanho)::NUMERIC, 0) + p_delta));
  ELSE
    SELECT COALESCE(SUM(value::NUMERIC), 0) INTO v_total FROM jsonb_each_text(v_estoque);
    v_estoque := jsonb_build_object('PP',0,'P',0,'M', v_total + p_delta,'G',0,'GG',0,'XGG',0);
  END IF;
  UPDATE produtos SET estoque = v_estoque WHERE id = p_produto_id;
END;
$$;

-- ─── HELPER: lê usarTamanhos da loja atual ───────────────────────────────────
CREATE OR REPLACE FUNCTION _usar_tamanhos() RETURNS BOOLEAN
LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT "usarTamanhos" FROM config WHERE loja_id = auth.uid()), TRUE);
$$;

-- ─── EXECUTAR VENDA ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION executar_venda(
  p_cliente_id UUID,
  p_cliente_nome TEXT,
  p_cliente_cidade TEXT,
  p_itens JSONB,
  p_total NUMERIC,
  p_forma_pagamento TEXT,
  p_entrada NUMERIC,
  p_numero_parcelas INT,
  p_observacoes TEXT,
  p_parcelas JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usar BOOLEAN := _usar_tamanhos();
  v_item JSONB;
  v_parcela JSONB;
  v_estoque JSONB;
  v_disp NUMERIC;
  v_qtd NUMERIC;
  v_tam TEXT;
  v_venda_id UUID;
BEGIN
  IF jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'A venda não tem itens';
  END IF;

  INSERT INTO vendas ("clienteId","clienteNome","clienteCidade",itens,total,"formaPagamento",entrada,"numeroParcelas",observacoes,status)
  VALUES (p_cliente_id, p_cliente_nome, COALESCE(p_cliente_cidade,''), p_itens, p_total, p_forma_pagamento,
    COALESCE(p_entrada,0), COALESCE(p_numero_parcelas,1), COALESCE(p_observacoes,''),
    CASE WHEN p_forma_pagamento = 'promissoria' THEN 'pendente' ELSE 'paga' END)
  RETURNING id INTO v_venda_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    v_qtd := (v_item->>'quantidade')::NUMERIC;
    v_tam := v_item->>'tamanho';
    SELECT estoque INTO v_estoque FROM produtos WHERE id = (v_item->>'produtoId')::UUID FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto "%" não encontrado', v_item->>'produtoNome';
    END IF;

    IF v_usar THEN
      v_disp := COALESCE((v_estoque->>v_tam)::NUMERIC, 0);
    ELSE
      SELECT COALESCE(SUM(value::NUMERIC), 0) INTO v_disp FROM jsonb_each_text(v_estoque);
    END IF;
    IF v_disp < v_qtd THEN
      RAISE EXCEPTION 'Estoque insuficiente: % — disponível: %, solicitado: %', v_item->>'produtoNome', v_disp, v_qtd;
    END IF;

    IF v_usar THEN
      v_estoque := jsonb_set(v_estoque, ARRAY[v_tam], to_jsonb(v_disp - v_qtd));
    ELSE
      v_estoque := jsonb_build_object('PP',0,'P',0,'M', v_disp - v_qtd,'G',0,'GG',0,'XGG',0);
    END IF;
    UPDATE produtos SET estoque = v_estoque WHERE id = (v_item->>'produtoId')::UUID;

    INSERT INTO movimentacoes ("produtoId","produtoNome",tipo,tamanho,quantidade,motivo,"vendaId")
    VALUES ((v_item->>'produtoId')::UUID, v_item->>'produtoNome', 'saida',
      CASE WHEN v_usar THEN v_tam ELSE 'M' END, v_qtd::INT, 'Venda', v_venda_id);
  END LOOP;

  IF p_parcelas IS NOT NULL THEN
    FOR v_parcela IN SELECT value FROM jsonb_array_elements(p_parcelas) LOOP
      INSERT INTO parcelas ("vendaId","clienteId","clienteNome","clienteTelefone",numero,"totalParcelas",valor,"valorPago","dataVencimento",status,pagamentos)
      VALUES (v_venda_id, p_cliente_id, v_parcela->>'clienteNome', COALESCE(v_parcela->>'clienteTelefone',''),
        (v_parcela->>'numero')::INT, (v_parcela->>'totalParcelas')::INT, (v_parcela->>'valor')::NUMERIC,
        COALESCE((v_parcela->>'valorPago')::NUMERIC,0), (v_parcela->>'dataVencimento')::TIMESTAMPTZ,
        COALESCE(v_parcela->>'status','pendente'), COALESCE(v_parcela->'pagamentos','[]'::JSONB));
    END LOOP;
  END IF;

  RETURN v_venda_id;
END;
$$;

-- ─── CANCELAR VENDA ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancelar_venda(p_venda_id UUID) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usar BOOLEAN := _usar_tamanhos();
  v_venda RECORD;
  v_item JSONB;
BEGIN
  SELECT * INTO v_venda FROM vendas WHERE id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;
  IF v_venda.status = 'cancelada' THEN RETURN; END IF;  -- idempotente

  UPDATE vendas SET status = 'cancelada' WHERE id = p_venda_id;
  UPDATE parcelas SET status = 'cancelada' WHERE "vendaId" = p_venda_id AND status <> 'paga';

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_venda.itens) LOOP
    PERFORM _aplicar_delta_estoque((v_item->>'produtoId')::UUID, v_item->>'tamanho',
      (v_item->>'quantidade')::NUMERIC, v_usar);
    INSERT INTO movimentacoes ("produtoId","produtoNome",tipo,tamanho,quantidade,motivo,"vendaId")
    VALUES ((v_item->>'produtoId')::UUID, v_item->>'produtoNome', 'entrada',
      CASE WHEN v_usar THEN v_item->>'tamanho' ELSE 'M' END, (v_item->>'quantidade')::INT,
      'Cancelamento da venda', p_venda_id);
  END LOOP;
END;
$$;

-- ─── EDITAR VENDA ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION editar_venda(
  p_venda_id UUID,
  p_cliente_id UUID,
  p_cliente_nome TEXT,
  p_cliente_cidade TEXT,
  p_forma_pagamento TEXT,
  p_itens_original JSONB,
  p_itens_atualizado JSONB,
  p_novo_total NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usar BOOLEAN := _usar_tamanhos();
  v_old JSONB;
  v_new JSONB;
  v_delta NUMERIC;
  v_estoque JSONB;
  v_novo NUMERIC;
  v_tam TEXT;
  i INT;
BEGIN
  FOR i IN 0 .. jsonb_array_length(p_itens_original) - 1 LOOP
    v_old := p_itens_original -> i;
    v_new := p_itens_atualizado -> i;
    v_delta := (v_new->>'quantidade')::NUMERIC - (v_old->>'quantidade')::NUMERIC;
    IF v_delta <> 0 THEN
      v_tam := v_old->>'tamanho';
      SELECT estoque INTO v_estoque FROM produtos WHERE id = (v_old->>'produtoId')::UUID FOR UPDATE;
      IF FOUND THEN
        IF v_usar THEN
          v_novo := COALESCE((v_estoque->>v_tam)::NUMERIC, 0) - v_delta;
          IF v_novo < 0 THEN
            RAISE EXCEPTION 'Estoque insuficiente para % (%)', v_old->>'produtoNome', v_tam;
          END IF;
          v_estoque := jsonb_set(v_estoque, ARRAY[v_tam], to_jsonb(v_novo));
        ELSE
          SELECT COALESCE(SUM(value::NUMERIC), 0) INTO v_novo FROM jsonb_each_text(v_estoque);
          v_novo := v_novo - v_delta;
          IF v_novo < 0 THEN
            RAISE EXCEPTION 'Estoque insuficiente para %', v_old->>'produtoNome';
          END IF;
          v_estoque := jsonb_build_object('PP',0,'P',0,'M', v_novo,'G',0,'GG',0,'XGG',0);
        END IF;
        UPDATE produtos SET estoque = v_estoque WHERE id = (v_old->>'produtoId')::UUID;
      END IF;
    END IF;
  END LOOP;

  UPDATE vendas SET
    "clienteId" = p_cliente_id, "clienteNome" = p_cliente_nome, "clienteCidade" = COALESCE(p_cliente_cidade,''),
    "formaPagamento" = p_forma_pagamento, itens = p_itens_atualizado, total = p_novo_total
  WHERE id = p_venda_id;
END;
$$;

-- ─── CRIAR CONSIGNAÇÃO ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION criar_consignacao(
  p_cliente_id UUID,
  p_cliente_nome TEXT,
  p_cliente_cidade TEXT,
  p_cliente_telefone TEXT,
  p_itens JSONB,
  p_observacoes TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usar BOOLEAN := _usar_tamanhos();
  v_item JSONB;
  v_itens_consig JSONB := '[]'::JSONB;
  v_total_entregue NUMERIC := 0;
  v_estoque JSONB;
  v_disp NUMERIC;
  v_qtd NUMERIC;
  v_tam TEXT;
  v_consig_id UUID;
BEGIN
  IF jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'A consignação não tem itens';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    v_itens_consig := v_itens_consig || jsonb_build_object(
      'produtoId', v_item->>'produtoId', 'produtoNome', v_item->>'produtoNome', 'tamanho', v_item->>'tamanho',
      'quantidade', (v_item->>'quantidade')::INT, 'precoUnitario', (v_item->>'precoUnitario')::NUMERIC,
      'vendidas', 0, 'devolvidas', 0);
    v_total_entregue := v_total_entregue + (v_item->>'quantidade')::NUMERIC * (v_item->>'precoUnitario')::NUMERIC;
  END LOOP;

  INSERT INTO consignacoes ("clienteId","clienteNome","clienteCidade","clienteTelefone",itens,"totalEntregue","totalRecebido",status,observacoes)
  VALUES (p_cliente_id, p_cliente_nome, COALESCE(p_cliente_cidade,''), COALESCE(p_cliente_telefone,''),
    v_itens_consig, v_total_entregue, 0, 'aberta', COALESCE(p_observacoes,''))
  RETURNING id INTO v_consig_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    v_qtd := (v_item->>'quantidade')::NUMERIC;
    v_tam := v_item->>'tamanho';
    SELECT estoque INTO v_estoque FROM produtos WHERE id = (v_item->>'produtoId')::UUID FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto "%" não encontrado', v_item->>'produtoNome';
    END IF;

    IF v_usar THEN
      v_disp := COALESCE((v_estoque->>v_tam)::NUMERIC, 0);
    ELSE
      SELECT COALESCE(SUM(value::NUMERIC), 0) INTO v_disp FROM jsonb_each_text(v_estoque);
    END IF;
    IF v_disp < v_qtd THEN
      RAISE EXCEPTION 'Estoque insuficiente: % — disponível: %, solicitado: %', v_item->>'produtoNome', v_disp, v_qtd;
    END IF;

    IF v_usar THEN
      v_estoque := jsonb_set(v_estoque, ARRAY[v_tam], to_jsonb(v_disp - v_qtd));
    ELSE
      v_estoque := jsonb_build_object('PP',0,'P',0,'M', v_disp - v_qtd,'G',0,'GG',0,'XGG',0);
    END IF;
    UPDATE produtos SET estoque = v_estoque WHERE id = (v_item->>'produtoId')::UUID;

    INSERT INTO movimentacoes ("produtoId","produtoNome",tipo,tamanho,quantidade,motivo)
    VALUES ((v_item->>'produtoId')::UUID, v_item->>'produtoNome', 'saida',
      CASE WHEN v_usar THEN v_tam ELSE 'M' END, v_qtd::INT, 'Consignação');
  END LOOP;

  RETURN v_consig_id;
END;
$$;

-- ─── REGISTRAR ACERTO ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION registrar_acerto(
  p_consignacao_id UUID,
  p_itens JSONB,           -- [{ produtoId, tamanho, vendidas, devolvidas }]
  p_forma_pagamento TEXT,
  p_observacoes TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usar BOOLEAN := _usar_tamanhos();
  v_consig RECORD;
  v_ci JSONB;
  v_mov JSONB;
  v_vend INT;
  v_dev INT;
  v_pend NUMERIC;
  v_valor NUMERIC := 0;
  v_new_itens JSONB := '[]'::JSONB;
  v_itens_acerto JSONB := '[]'::JSONB;
  v_tudo BOOLEAN;
BEGIN
  SELECT * INTO v_consig FROM consignacoes WHERE id = p_consignacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consignação não encontrada'; END IF;
  IF v_consig.status <> 'aberta' THEN RAISE EXCEPTION 'Esta consignação já está encerrada'; END IF;

  FOR v_ci IN SELECT value FROM jsonb_array_elements(v_consig.itens) LOOP
    SELECT m.value INTO v_mov FROM jsonb_array_elements(p_itens) m
      WHERE m.value->>'produtoId' = v_ci->>'produtoId' AND m.value->>'tamanho' = v_ci->>'tamanho'
      LIMIT 1;

    v_vend := GREATEST(0, FLOOR(COALESCE((v_mov->>'vendidas')::NUMERIC, 0)))::INT;
    v_dev  := GREATEST(0, FLOOR(COALESCE((v_mov->>'devolvidas')::NUMERIC, 0)))::INT;
    v_pend := (v_ci->>'quantidade')::NUMERIC - (v_ci->>'vendidas')::NUMERIC - (v_ci->>'devolvidas')::NUMERIC;

    IF v_vend + v_dev > v_pend THEN
      RAISE EXCEPTION '% (%): % peças excedem o pendente (%)', v_ci->>'produtoNome', v_ci->>'tamanho', v_vend + v_dev, v_pend;
    END IF;

    IF v_vend > 0 OR v_dev > 0 THEN
      v_valor := v_valor + v_vend * (v_ci->>'precoUnitario')::NUMERIC;
      v_itens_acerto := v_itens_acerto || jsonb_build_object(
        'produtoId', v_ci->>'produtoId', 'produtoNome', v_ci->>'produtoNome', 'tamanho', v_ci->>'tamanho',
        'vendidas', v_vend, 'devolvidas', v_dev, 'precoUnitario', (v_ci->>'precoUnitario')::NUMERIC);
      IF v_dev > 0 THEN
        PERFORM _aplicar_delta_estoque((v_ci->>'produtoId')::UUID, v_ci->>'tamanho', v_dev, v_usar);
        INSERT INTO movimentacoes ("produtoId","produtoNome",tipo,tamanho,quantidade,motivo)
        VALUES ((v_ci->>'produtoId')::UUID, v_ci->>'produtoNome', 'entrada',
          CASE WHEN v_usar THEN v_ci->>'tamanho' ELSE 'M' END, v_dev, 'Devolução de consignação');
      END IF;
    END IF;

    v_new_itens := v_new_itens || jsonb_build_object(
      'produtoId', v_ci->>'produtoId', 'produtoNome', v_ci->>'produtoNome', 'tamanho', v_ci->>'tamanho',
      'quantidade', (v_ci->>'quantidade')::INT, 'precoUnitario', (v_ci->>'precoUnitario')::NUMERIC,
      'vendidas', (v_ci->>'vendidas')::INT + v_vend, 'devolvidas', (v_ci->>'devolvidas')::INT + v_dev);
  END LOOP;

  IF jsonb_array_length(v_itens_acerto) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma peça vendida ou devolvida';
  END IF;

  INSERT INTO consignacao_acertos ("consignacaoId","clienteId","clienteNome",itens,"valorRecebido","formaPagamento",observacoes)
  VALUES (p_consignacao_id, v_consig."clienteId", v_consig."clienteNome", v_itens_acerto, v_valor,
    COALESCE(p_forma_pagamento,'dinheiro'), COALESCE(p_observacoes,''));

  SELECT bool_and((i->>'vendidas')::NUMERIC + (i->>'devolvidas')::NUMERIC >= (i->>'quantidade')::NUMERIC)
    INTO v_tudo FROM jsonb_array_elements(v_new_itens) i;

  UPDATE consignacoes SET
    itens = v_new_itens,
    "totalRecebido" = "totalRecebido" + v_valor,
    status = CASE WHEN v_tudo THEN 'fechada' ELSE 'aberta' END
  WHERE id = p_consignacao_id;
END;
$$;

-- ─── PERMISSÕES ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION _aplicar_delta_estoque(UUID,TEXT,NUMERIC,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION _usar_tamanhos() TO authenticated;
GRANT EXECUTE ON FUNCTION executar_venda(UUID,TEXT,TEXT,JSONB,NUMERIC,TEXT,NUMERIC,INT,TEXT,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION cancelar_venda(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION editar_venda(UUID,UUID,TEXT,TEXT,TEXT,JSONB,JSONB,NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION criar_consignacao(UUID,TEXT,TEXT,TEXT,JSONB,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION registrar_acerto(UUID,JSONB,TEXT,TEXT) TO authenticated;
