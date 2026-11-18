-- ============================================================================
-- MIGRATION 014 — Travar EXECUTE das RPCs internas (apenas authenticated)
--
-- O Postgres concede EXECUTE a PUBLIC por padrão ao criar uma função. As RPCs
-- 012/013 ganharam GRANT para `authenticated`, mas o PUBLIC nunca foi revogado
-- — então o role `anon` também conseguia chamá-las. Não havia risco de dados
-- (ambas são SECURITY INVOKER e o RLS por loja_id = auth.uid() bloqueia tudo
-- para o anônimo), mas é superfície desnecessária. Aqui removemos o PUBLIC e
-- deixamos só `authenticated`.
--
-- criar_pedido NÃO entra aqui: é SECURITY DEFINER e DEVE continuar público
-- (anon) — é o fluxo do catálogo. Sua proteção é a validação interna por slug.
--
-- Idempotente. Execute no SQL Editor do Supabase.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION registrar_pagamento(UUID, NUMERIC, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION registrar_pagamento(UUID, NUMERIC, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION finalizar_pedido(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, INT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION finalizar_pedido(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, INT, JSONB) TO authenticated;

-- Os helpers transacionais chamados internamente também não precisam de PUBLIC.
-- (Idempotente: se algum nome/assinatura não existir nesta base, comente a linha.)
REVOKE EXECUTE ON FUNCTION executar_venda(UUID, TEXT, TEXT, JSONB, NUMERIC, TEXT, NUMERIC, INT, TEXT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION executar_venda(UUID, TEXT, TEXT, JSONB, NUMERIC, TEXT, NUMERIC, INT, TEXT, JSONB) TO authenticated;
