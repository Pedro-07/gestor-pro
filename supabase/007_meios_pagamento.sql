-- ============================================================================
-- MIGRATION 007 — Meios de pagamento configuráveis
-- O lojista escolhe quais meios aparecem no PDV e, por meio, uma regra de
-- desconto máximo (%). Para o consignado, a regra é de comissão (%).
-- Estrutura: { <meio>: { ativo: bool, regra: bool, valor: number(%) } }
-- Idempotente. Execute no SQL Editor do Supabase.
-- ============================================================================

ALTER TABLE config ADD COLUMN IF NOT EXISTS "meiosPagamento" JSONB
  DEFAULT '{"dinheiro":{"ativo":true,"regra":false,"valor":0},"pix":{"ativo":true,"regra":false,"valor":0},"cartao":{"ativo":true,"regra":false,"valor":0},"promissoria":{"ativo":true,"regra":false,"valor":0},"consignado":{"ativo":true,"regra":false,"valor":0}}';
