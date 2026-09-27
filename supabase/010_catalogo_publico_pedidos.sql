-- ============================================================================
-- MIGRATION 010 — Catálogo público (loja online) + Pedidos
-- Adiciona:
--   * config.slug           → identificador público da loja na URL (/loja/<slug>)
--   * config.catalogoAtivo  → liga/desliga o catálogo público
--   * tabela pedidos        → pedidos feitos pelos clientes no catálogo online
-- Idempotente. Execute no SQL Editor do Supabase.
-- (As funções públicas SECURITY DEFINER estão na migration 011.)
-- ============================================================================

-- ─── CONFIG: slug + catálogo ativo ───────────────────────────────────────────
ALTER TABLE config ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE config ADD COLUMN IF NOT EXISTS "catalogoAtivo" BOOLEAN DEFAULT FALSE;

-- slug único (ignora nulos: lojas que ainda não configuraram o catálogo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_config_slug ON config (slug) WHERE slug IS NOT NULL;

-- ─── PEDIDOS ─────────────────────────────────────────────────────────────────
-- Snapshot do que o cliente montou no catálogo. NÃO baixa estoque: é uma
-- solicitação. A baixa acontece quando a dona finaliza (vira uma venda).
CREATE TABLE IF NOT EXISTS pedidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL,
  "clienteNome" TEXT NOT NULL,
  "clienteCpfCnpj" TEXT NOT NULL DEFAULT '',
  "clienteTelefone" TEXT NOT NULL DEFAULT '',
  "clienteCidade" TEXT NOT NULL DEFAULT '',
  "clienteEndereco" TEXT NOT NULL DEFAULT '',
  "clienteObservacoes" TEXT,
  itens JSONB NOT NULL DEFAULT '[]',
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','finalizado','cancelado')),
  "vendaId" UUID,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_loja ON pedidos (loja_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos (loja_id, status);

-- RLS: só a dona da loja enxerga/gerencia seus pedidos.
-- O cliente anônimo NUNCA acessa a tabela direto — só insere via RPC (migration 011).
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Isolamento por Loja" ON pedidos;
CREATE POLICY "Isolamento por Loja" ON pedidos FOR ALL USING (loja_id = auth.uid());
