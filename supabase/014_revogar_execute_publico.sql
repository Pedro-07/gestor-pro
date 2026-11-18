-- ============================================================================
-- MIGRATION 014 — Travar EXECUTE das RPCs internas (apenas authenticated)
--
-- As RPCs internas (registrar_pagamento, finalizar_pedido, executar_venda) são
-- SECURITY INVOKER: o RLS por loja_id = auth.uid() já bloqueia TODO acesso do
-- anônimo (um anon sempre recebe "não encontrado"). Não há risco de dados —
-- isto é só remoção de superfície desnecessária.
--
-- IMPORTANTE: no Supabase não basta REVOKE FROM PUBLIC. O schema `public` tem
-- DEFAULT PRIVILEGES que concedem EXECUTE a `anon` EXPLICITAMENTE ao criar a
-- função. Por isso revogamos de PUBLIC **e** de anon. Mantemos authenticated.
--
-- Usa regprocedure (DO block) para pegar a assinatura real de cada função,
-- independentemente dos tipos declarados, e é idempotente/seguro se alguma
-- não existir nesta base.
--
-- criar_pedido NÃO entra aqui: é SECURITY DEFINER e DEVE seguir público (anon)
-- — é o fluxo do catálogo, protegido pela validação interna de slug.
--
-- Execute no SQL Editor do Supabase.
-- ============================================================================

DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('registrar_pagamento', 'finalizar_pedido', 'executar_venda')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    RAISE NOTICE 'EXECUTE restrito a authenticated: %', f.sig;
  END LOOP;
END $$;
