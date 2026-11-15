-- ============================================================================
-- MIGRATION 013 — Blindagem do fluxo de pedidos (loja online)
--
-- 1) finalizar_pedido: finalização ATÔMICA — trava o pedido (FOR UPDATE),
--    valida que ainda está 'novo' (impede dupla finalização = baixa dupla de
--    estoque), executa a venda com os itens gravados NO BANCO (não os do
--    navegador) e vincula a venda ao pedido, tudo numa única transação.
--
-- 2) criar_pedido (v2): a RPC é pública (anon) e antes aceitava qualquer
--    payload. Agora: limita itens/quantidades/tamanho dos textos, valida o
--    estoque disponível (mensagem amigável pro cliente) e aplica um limite de
--    frequência simples (por telefone/hora e por loja/dia) contra spam.
--
-- 3) Habilita Realtime na tabela pedidos (notificação de pedido novo no app).
--
-- Idempotente (CREATE OR REPLACE / DO). Execute no SQL Editor do Supabase.
-- ============================================================================

-- ─── 1. FINALIZAR PEDIDO (dona da loja, transacional) ────────────────────────
CREATE OR REPLACE FUNCTION finalizar_pedido(
  p_pedido_id UUID,
  p_cliente_id UUID,
  p_cliente_nome TEXT,
  p_cliente_cidade TEXT,
  p_forma_pagamento TEXT,
  p_entrada NUMERIC,
  p_numero_parcelas INT,
  p_parcelas JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido RECORD;
  v_venda_id UUID;
BEGIN
  SELECT id, status, itens, total INTO v_pedido
    FROM pedidos WHERE id = p_pedido_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF v_pedido.status <> 'novo' THEN
    RAISE EXCEPTION 'Este pedido já foi % — recarregue a página', v_pedido.status;
  END IF;

  -- Reusa a RPC transacional de venda (valida/trava estoque, cria parcelas…)
  v_venda_id := executar_venda(
    p_cliente_id, p_cliente_nome, COALESCE(p_cliente_cidade, ''),
    v_pedido.itens, v_pedido.total, p_forma_pagamento,
    COALESCE(p_entrada, 0), COALESCE(p_numero_parcelas, 1),
    'Pedido online #' || left(p_pedido_id::TEXT, 8),
    p_parcelas
  );

  UPDATE pedidos
    SET status = 'finalizado', "vendaId" = v_venda_id, "updatedAt" = now()
    WHERE id = p_pedido_id;

  RETURN v_venda_id;
END;
$$;

GRANT EXECUTE ON FUNCTION finalizar_pedido(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, INT, JSONB) TO authenticated;

-- ─── 2. CRIAR PEDIDO v2 (anon, com limites e validação de estoque) ───────────
CREATE OR REPLACE FUNCTION public.criar_pedido(
  p_slug TEXT,
  p_cliente JSONB,
  p_itens JSONB,
  p_observacoes TEXT
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_loja UUID;
  v_ativo BOOLEAN;
  v_usar BOOLEAN;
  v_item JSONB;
  v_prod RECORD;
  v_qtd NUMERIC;
  v_tam TEXT;
  v_disp NUMERIC;
  v_sub NUMERIC;
  v_itens JSONB := '[]'::jsonb;
  v_total NUMERIC := 0;
  v_pedido_id UUID;
  v_telefone TEXT;
  v_recentes INT;
BEGIN
  SELECT loja_id, "catalogoAtivo", COALESCE("usarTamanhos", TRUE)
    INTO v_loja, v_ativo, v_usar
    FROM config WHERE slug = p_slug LIMIT 1;

  IF v_loja IS NULL OR v_ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'Loja não encontrada ou catálogo indisponível';
  END IF;

  IF COALESCE(btrim(p_cliente->>'nome'), '') = '' THEN
    RAISE EXCEPTION 'Nome do cliente é obrigatório';
  END IF;

  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens';
  END IF;
  IF jsonb_array_length(p_itens) > 30 THEN
    RAISE EXCEPTION 'Pedido com itens demais — máximo de 30 produtos por pedido';
  END IF;

  -- Limite de frequência (anti-spam): 5 pedidos/hora por telefone na mesma
  -- loja e 200 pedidos/dia por loja. Simples, mas corta abuso por script.
  v_telefone := left(regexp_replace(COALESCE(p_cliente->>'telefone', ''), '\D', '', 'g'), 20);
  IF v_telefone <> '' THEN
    SELECT count(*) INTO v_recentes FROM pedidos
      WHERE loja_id = v_loja
        AND regexp_replace("clienteTelefone", '\D', '', 'g') = v_telefone
        AND "createdAt" > now() - interval '1 hour';
    IF v_recentes >= 5 THEN
      RAISE EXCEPTION 'Muitos pedidos recentes deste telefone — aguarde um pouco ou chame a loja no WhatsApp';
    END IF;
  END IF;
  SELECT count(*) INTO v_recentes FROM pedidos
    WHERE loja_id = v_loja AND "createdAt" > now() - interval '1 day';
  IF v_recentes >= 200 THEN
    RAISE EXCEPTION 'A loja atingiu o limite de pedidos de hoje — tente novamente mais tarde';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_qtd := floor(COALESCE((v_item->>'quantidade')::NUMERIC, 0));
    IF v_qtd <= 0 THEN CONTINUE; END IF;
    IF v_qtd > 99 THEN
      RAISE EXCEPTION 'Quantidade inválida — máximo de 99 unidades por item';
    END IF;
    v_tam := COALESCE(v_item->>'tamanho', 'M');

    SELECT id, nome, "precoVenda", estoque INTO v_prod
      FROM produtos
      WHERE id = (v_item->>'produtoId')::UUID
        AND loja_id = v_loja
        AND COALESCE(ativo, TRUE) = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto indisponível no pedido';
    END IF;

    -- Valida contra o estoque atual: evita o cliente pedir o que não existe
    -- e só descobrir depois, no WhatsApp. (O estoque NÃO é baixado aqui — a
    -- baixa acontece quando a dona finaliza o pedido.)
    IF v_usar THEN
      v_disp := COALESCE((v_prod.estoque->>v_tam)::NUMERIC, 0);
    ELSE
      SELECT COALESCE(SUM(value::NUMERIC), 0) INTO v_disp FROM jsonb_each_text(v_prod.estoque);
    END IF;
    IF v_disp < v_qtd THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%"% — disponível: %',
        v_prod.nome, CASE WHEN v_usar THEN ' (' || v_tam || ')' ELSE '' END, v_disp;
    END IF;

    v_sub := round(v_prod."precoVenda" * v_qtd, 2);
    v_total := v_total + v_sub;
    v_itens := v_itens || jsonb_build_object(
      'produtoId', v_prod.id,
      'produtoNome', v_prod.nome,
      'tamanho', v_tam,
      'quantidade', v_qtd,
      'precoUnitario', v_prod."precoVenda",
      'subtotal', v_sub
    );
  END LOOP;

  IF jsonb_array_length(v_itens) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens válidos';
  END IF;

  INSERT INTO pedidos (
    loja_id, "clienteNome", "clienteCpfCnpj", "clienteTelefone", "clienteCidade",
    "clienteEndereco", "clienteObservacoes", itens, total, observacoes, status
  ) VALUES (
    v_loja,
    left(btrim(p_cliente->>'nome'), 120),
    left(COALESCE(p_cliente->>'cpfCnpj', ''), 20),
    left(COALESCE(p_cliente->>'telefone', ''), 20),
    left(COALESCE(p_cliente->>'cidade', ''), 80),
    left(COALESCE(p_cliente->>'endereco', ''), 200),
    NULLIF(left(btrim(COALESCE(p_cliente->>'observacoes', '')), 500), ''),
    v_itens, v_total, NULLIF(left(btrim(COALESCE(p_observacoes, '')), 500), ''), 'novo'
  ) RETURNING id INTO v_pedido_id;

  RETURN json_build_object('pedidoId', v_pedido_id, 'total', v_total, 'itens', v_itens);
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_pedido(TEXT, JSONB, JSONB, TEXT) TO anon, authenticated;

-- ─── 3. REALTIME: notificação de pedido novo no app da dona ──────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- já estava na publicação
END;
$$;
