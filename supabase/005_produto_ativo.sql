-- ============================================================================
-- MIGRATION 005 — Ativar/Desativar produto (soft delete)
-- Produtos com histórico de movimentações não podem ser excluídos (FK).
-- Em vez de excluir, o lojista DESATIVA o produto (preserva o histórico).
-- Idempotente. Execute no SQL Editor do Supabase.
-- ============================================================================

ALTER TABLE produtos ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
