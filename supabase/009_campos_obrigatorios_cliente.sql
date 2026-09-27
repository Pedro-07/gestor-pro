-- ============================================================================
-- MIGRATION 009 — Campos obrigatórios configuráveis no cadastro de cliente
-- Permite ao lojista escolher quais campos são obrigatórios ao cadastrar/editar
-- um cliente. Padrão: todos obrigatórios (preserva o comportamento atual).
-- O "nome" é sempre obrigatório e não faz parte desta configuração.
-- Idempotente. Execute no SQL Editor do Supabase.
-- ============================================================================

ALTER TABLE config ADD COLUMN IF NOT EXISTS "camposObrigatoriosCliente" JSONB
  DEFAULT '{"cpfCnpj":true,"telefone":true,"cidade":true,"endereco":true}';
