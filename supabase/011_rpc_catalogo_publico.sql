-- ============================================================================
-- MIGRATION 011 — RPCs públicas do catálogo (SECURITY DEFINER)
-- O catálogo é acessado por clientes ANÔNIMOS (sem login). Em vez de abrir as
-- tabelas para o role `anon` (arriscado), expomos apenas 3 funções controladas:
--   * catalogo_loja(slug)      → dados públicos da loja (nome, logo, whatsapp, regras)
--   * catalogo_produtos(slug)  → produtos ativos + estoque (tempo real)
--   * criar_pedido(...)        → cria um pedido calculando preços no servidor
-- SECURITY DEFINER: rodam com o dono da função (postgres), então enxergam os
-- dados da loja mesmo com RLS ligado — mas SEMPRE filtrando pelo slug informado.
-- Idempotente (CREATE OR REPLACE). Execute no SQL Editor do Supabase.
-- ============================================================================

-- ─── DADOS PÚBLICOS DA LOJA ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.catalogo_loja(p_slug TEXT)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT json_build_object(
    'lojaId', c.loja_id,
    'nomeApp', c."nomeApp",
    'logoUrl', c."logoUrl",
    'telefoneVendedor', c."telefoneVendedor",
    'usarTamanhos', COALESCE(c."usarTamanhos", TRUE),
    'tamanhos', COALESCE(c.tamanhos, '["PP","P","M","G","GG","XGG"]'::jsonb),
    'camposObrigatoriosCliente', COALESCE(c."camposObrigatoriosCliente",
      '{"cpfCnpj":true,"telefone":true,"cidade":true,"endereco":true}'::jsonb)
  )
  FROM config c
  WHERE c.slug = p_slug AND c."catalogoAtivo" = TRUE
  LIMIT 1;
$$;

-- ─── PRODUTOS DO CATÁLOGO (tempo real) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.catalogo_produtos(p_slug TEXT)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(json_agg(json_build_object(
    'id', p.id,
    'codigo', p.codigo,
    'nome', p.nome,
    'descricao', p.descricao,
    'categoria', p.categoria,
    'precoVenda', p."precoVenda",
    'estoque', p.estoque,
    'fotoUrl', p."fotoUrl"
  ) ORDER BY p.nome), '[]'::json)
  FROM produtos p
  JOIN config c ON c.loja_id = p.loja_id
  WHERE c.slug = p_slug
    AND c."catalogoAtivo" = TRUE
    AND COALESCE(p.ativo, TRUE) = TRUE;
$$;

-- ─── CRIAR PEDIDO (cliente anônimo) ──────────────────────────────────────────
-- Recebe apenas produtoId/tamanho/quantidade. Preço, nome e subtotal são
-- calculados AQUI no servidor (nunca confiar no que vem do navegador).
-- NÃO baixa estoque — o pedido é uma solicitação até a dona finalizar.
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
  v_item JSONB;
  v_prod RECORD;
  v_qtd NUMERIC;
  v_sub NUMERIC;
  v_itens JSONB := '[]'::jsonb;
  v_total NUMERIC := 0;
  v_pedido_id UUID;
BEGIN
  SELECT loja_id, "catalogoAtivo" INTO v_loja, v_ativo
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_qtd := floor(COALESCE((v_item->>'quantidade')::NUMERIC, 0));
    IF v_qtd <= 0 THEN CONTINUE; END IF;

    SELECT id, nome, "precoVenda" INTO v_prod
      FROM produtos
      WHERE id = (v_item->>'produtoId')::UUID
        AND loja_id = v_loja
        AND COALESCE(ativo, TRUE) = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto indisponível no pedido';
    END IF;

    v_sub := round(v_prod."precoVenda" * v_qtd, 2);
    v_total := v_total + v_sub;
    v_itens := v_itens || jsonb_build_object(
      'produtoId', v_prod.id,
      'produtoNome', v_prod.nome,
      'tamanho', COALESCE(v_item->>'tamanho', 'M'),
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
    btrim(p_cliente->>'nome'),
    COALESCE(p_cliente->>'cpfCnpj', ''),
    COALESCE(p_cliente->>'telefone', ''),
    COALESCE(p_cliente->>'cidade', ''),
    COALESCE(p_cliente->>'endereco', ''),
    NULLIF(btrim(COALESCE(p_cliente->>'observacoes', '')), ''),
    v_itens, v_total, NULLIF(btrim(COALESCE(p_observacoes, '')), ''), 'novo'
  ) RETURNING id INTO v_pedido_id;

  RETURN json_build_object('pedidoId', v_pedido_id, 'total', v_total, 'itens', v_itens);
END;
$$;

-- ─── PERMISSÕES: liberar as 3 funções para o público (anon) ───────────────────
GRANT EXECUTE ON FUNCTION public.catalogo_loja(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalogo_produtos(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_pedido(TEXT, JSONB, JSONB, TEXT) TO anon, authenticated;
