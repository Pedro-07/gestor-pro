-- ============================================================================
-- MIGRATION 006 — Tamanhos customizáveis
-- O lojista escolhe quais tamanhos usar (letras PP–XGG, números 36–46, etc.).
-- - config.tamanhos: lista de tamanhos da loja (JSONB array de strings).
-- - Remove a trava (CHECK) de tamanho em movimentacoes para permitir números.
-- Idempotente. Execute no SQL Editor do Supabase.
-- ============================================================================

ALTER TABLE config ADD COLUMN IF NOT EXISTS tamanhos JSONB DEFAULT '["PP","P","M","G","GG","XGG"]';

-- A trava antiga só permitia PP..XGG; soltamos para aceitar tamanhos numéricos/custom.
ALTER TABLE movimentacoes DROP CONSTRAINT IF EXISTS movimentacoes_tamanho_check;
