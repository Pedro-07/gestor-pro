-- ============================================================================
-- MIGRATION 008 — Comissão do consignado (corrige o cálculo)
-- A comissão (%) é o que o FORNECEDOR paga ao LOJISTA sobre o preço de repasse.
-- Guardamos a comissão na consignação (preço de repasse CHEIO) e aplicamos no
-- ACERTO: sobre o bruto vendido (peças vendidas × preço de repasse). O
-- fornecedor recebe o líquido = bruto − comissão.
--   Ex.: repasse R$100/peça, comissão 30%. Vendeu 5 → bruto R$500,
--        comissão R$150, o fornecedor recebe R$350.
-- Idempotente. Execute no SQL Editor do Supabase.
-- ============================================================================

ALTER TABLE consignacoes ADD COLUMN IF NOT EXISTS "comissaoPct" NUMERIC(5,2) NOT NULL DEFAULT 0;

-- ─── criar_consignacao: passa a receber a comissão e guarda o preço de repasse cheio ──
DROP FUNCTION IF EXISTS criar_consignacao(UUID, TEXT, TEXT, TEXT, JSONB, TEXT);
CREATE OR REPLACE FUNCTION criar_consignacao(
  p_cliente_id UUID,
  p_cliente_nome TEXT,
  p_cliente_cidade TEXT,
  p_cliente_telefone TEXT,
  p_itens JSONB,
  p_observacoes TEXT,
  p_comissao NUMERIC DEFAULT 0
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
  IF jsonb_array_length(p_itens) = 0 THEN RAISE EXCEPTION 'A consignação não tem itens'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    v_itens_consig := v_itens_consig || jsonb_build_object(
      'produtoId', v_item->>'produtoId', 'produtoNome', v_item->>'produtoNome', 'tamanho', v_item->>'tamanho',
      'quantidade', (v_item->>'quantidade')::INT, 'precoUnitario', (v_item->>'precoUnitario')::NUMERIC,
      'vendidas', 0, 'devolvidas', 0);
    v_total_entregue := v_total_entregue + (v_item->>'quantidade')::NUMERIC * (v_item->>'precoUnitario')::NUMERIC;
  END LOOP;

  INSERT INTO consignacoes ("clienteId","clienteNome","clienteCidade","clienteTelefone",itens,"totalEntregue","totalRecebido",status,observacoes,"comissaoPct")
  VALUES (p_cliente_id, p_cliente_nome, COALESCE(p_cliente_cidade,''), COALESCE(p_cliente_telefone,''),
    v_itens_consig, v_total_entregue, 0, 'aberta', COALESCE(p_observacoes,''), COALESCE(p_comissao,0))
  RETURNING id INTO v_consig_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    v_qtd := (v_item->>'quantidade')::NUMERIC;
    v_tam := v_item->>'tamanho';
    SELECT estoque INTO v_estoque FROM produtos WHERE id = (v_item->>'produtoId')::UUID FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto "%" não encontrado', v_item->>'produtoNome'; END IF;
    IF v_usar THEN v_disp := COALESCE((v_estoque->>v_tam)::NUMERIC, 0);
    ELSE SELECT COALESCE(SUM(value::NUMERIC), 0) INTO v_disp FROM jsonb_each_text(v_estoque); END IF;
    IF v_disp < v_qtd THEN RAISE EXCEPTION 'Estoque insuficiente: % — disponível: %, solicitado: %', v_item->>'produtoNome', v_disp, v_qtd; END IF;
    IF v_usar THEN v_estoque := jsonb_set(v_estoque, ARRAY[v_tam], to_jsonb(v_disp - v_qtd));
    ELSE v_estoque := jsonb_build_object('PP',0,'P',0,'M', v_disp - v_qtd,'G',0,'GG',0,'XGG',0); END IF;
    UPDATE produtos SET estoque = v_estoque WHERE id = (v_item->>'produtoId')::UUID;
    INSERT INTO movimentacoes ("produtoId","produtoNome",tipo,tamanho,quantidade,motivo)
    VALUES ((v_item->>'produtoId')::UUID, v_item->>'produtoNome', 'saida', CASE WHEN v_usar THEN v_tam ELSE 'M' END, v_qtd::INT, 'Consignação');
  END LOOP;

  RETURN v_consig_id;
END;
$$;
GRANT EXECUTE ON FUNCTION criar_consignacao(UUID,TEXT,TEXT,TEXT,JSONB,TEXT,NUMERIC) TO authenticated;

-- ─── registrar_acerto: aplica a comissão sobre o bruto vendido (líquido ao fornecedor) ──
CREATE OR REPLACE FUNCTION registrar_acerto(
  p_consignacao_id UUID,
  p_itens JSONB,
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
  v_bruto NUMERIC := 0;
  v_valor NUMERIC := 0;
  v_comissao NUMERIC;
  v_new_itens JSONB := '[]'::JSONB;
  v_itens_acerto JSONB := '[]'::JSONB;
  v_tudo BOOLEAN;
BEGIN
  SELECT * INTO v_consig FROM consignacoes WHERE id = p_consignacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consignação não encontrada'; END IF;
  IF v_consig.status <> 'aberta' THEN RAISE EXCEPTION 'Esta consignação já está encerrada'; END IF;
  v_comissao := COALESCE(v_consig."comissaoPct", 0);

  FOR v_ci IN SELECT value FROM jsonb_array_elements(v_consig.itens) LOOP
    SELECT m.value INTO v_mov FROM jsonb_array_elements(p_itens) m
      WHERE m.value->>'produtoId' = v_ci->>'produtoId' AND m.value->>'tamanho' = v_ci->>'tamanho' LIMIT 1;
    v_vend := GREATEST(0, FLOOR(COALESCE((v_mov->>'vendidas')::NUMERIC, 0)))::INT;
    v_dev  := GREATEST(0, FLOOR(COALESCE((v_mov->>'devolvidas')::NUMERIC, 0)))::INT;
    v_pend := (v_ci->>'quantidade')::NUMERIC - (v_ci->>'vendidas')::NUMERIC - (v_ci->>'devolvidas')::NUMERIC;
    IF v_vend + v_dev > v_pend THEN
      RAISE EXCEPTION '% (%): % peças excedem o pendente (%)', v_ci->>'produtoNome', v_ci->>'tamanho', v_vend + v_dev, v_pend; END IF;
    IF v_vend > 0 OR v_dev > 0 THEN
      v_bruto := v_bruto + v_vend * (v_ci->>'precoUnitario')::NUMERIC;
      v_itens_acerto := v_itens_acerto || jsonb_build_object(
        'produtoId', v_ci->>'produtoId', 'produtoNome', v_ci->>'produtoNome', 'tamanho', v_ci->>'tamanho',
        'vendidas', v_vend, 'devolvidas', v_dev, 'precoUnitario', (v_ci->>'precoUnitario')::NUMERIC);
      IF v_dev > 0 THEN
        PERFORM _aplicar_delta_estoque((v_ci->>'produtoId')::UUID, v_ci->>'tamanho', v_dev, v_usar);
        INSERT INTO movimentacoes ("produtoId","produtoNome",tipo,tamanho,quantidade,motivo)
        VALUES ((v_ci->>'produtoId')::UUID, v_ci->>'produtoNome', 'entrada', CASE WHEN v_usar THEN v_ci->>'tamanho' ELSE 'M' END, v_dev, 'Devolução de consignação');
      END IF;
    END IF;
    v_new_itens := v_new_itens || jsonb_build_object(
      'produtoId', v_ci->>'produtoId', 'produtoNome', v_ci->>'produtoNome', 'tamanho', v_ci->>'tamanho',
      'quantidade', (v_ci->>'quantidade')::INT, 'precoUnitario', (v_ci->>'precoUnitario')::NUMERIC,
      'vendidas', (v_ci->>'vendidas')::INT + v_vend, 'devolvidas', (v_ci->>'devolvidas')::INT + v_dev);
  END LOOP;

  IF jsonb_array_length(v_itens_acerto) = 0 THEN RAISE EXCEPTION 'Informe ao menos uma peça vendida ou devolvida'; END IF;

  -- Comissão do lojista sobre o bruto vendido; o fornecedor recebe o líquido.
  v_valor := ROUND(v_bruto * (1 - v_comissao / 100.0), 2);

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
GRANT EXECUTE ON FUNCTION registrar_acerto(UUID,JSONB,TEXT,TEXT) TO authenticated;
