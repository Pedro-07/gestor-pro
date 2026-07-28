-- ============================================================================
-- MIGRATION 004 — Campos opcionais no cadastro de produto
-- Permite ao lojista escolher se os campos "Fornecedor" e "Observações"
-- aparecem no cadastro de produtos. Padrão: desativados (não aparecem).
-- Idempotente. Execute no SQL Editor do Supabase.
-- ============================================================================

ALTER TABLE config ADD COLUMN IF NOT EXISTS "usarFornecedor" BOOLEAN DEFAULT FALSE;
ALTER TABLE config ADD COLUMN IF NOT EXISTS "usarObservacoes" BOOLEAN DEFAULT FALSE;
