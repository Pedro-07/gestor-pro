-- ============================================================================
-- MIGRATION 002 — CONSIGNAÇÃO (venda em consignação / acerto de contas)
-- Idempotente: pode rodar em banco já existente sem perder dados.
-- Execute no SQL Editor do Supabase Dashboard.
-- ============================================================================

-- ─── CONSIGNAÇÕES ────────────────────────────────────────────────────────────
-- Uma consignação = lote de peças entregues a um lojista. Ele não paga na
-- entrega; ao longo do tempo faz "acertos" pagando as vendidas (ao preço de
-- repasse = precoVenda) e devolvendo o restante.
CREATE TABLE IF NOT EXISTS consignacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL DEFAULT auth.uid(),
  "clienteId" UUID NOT NULL REFERENCES clientes(id),
  "clienteNome" TEXT NOT NULL,
  "clienteCidade" TEXT NOT NULL DEFAULT '',
  "clienteTelefone" TEXT NOT NULL DEFAULT '',
  -- itens: [{ produtoId, produtoNome, tamanho, quantidade, precoUnitario, vendidas, devolvidas }]
  itens JSONB NOT NULL DEFAULT '[]',
  "totalEntregue" NUMERIC(10,2) NOT NULL DEFAULT 0,   -- valor potencial (qtd entregue × preço repasse)
  "totalRecebido" NUMERIC(10,2) NOT NULL DEFAULT 0,   -- acumulado efetivamente pago nos acertos
  status TEXT NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta','fechada','cancelada')),
  observacoes TEXT,
  "dataEntrega" TIMESTAMPTZ DEFAULT now(),
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- ─── ACERTOS DE CONSIGNAÇÃO ──────────────────────────────────────────────────
-- Cada acerto é uma prestação de contas parcial: informa quantas de cada item
-- foram vendidas (paga) e/ou devolvidas (volta ao estoque).
CREATE TABLE IF NOT EXISTS consignacao_acertos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL DEFAULT auth.uid(),
  "consignacaoId" UUID NOT NULL REFERENCES consignacoes(id) ON DELETE CASCADE,
  "clienteId" UUID NOT NULL REFERENCES clientes(id),
  "clienteNome" TEXT NOT NULL,
  -- itens: [{ produtoId, produtoNome, tamanho, vendidas, devolvidas, precoUnitario }]
  itens JSONB NOT NULL DEFAULT '[]',
  "valorRecebido" NUMERIC(10,2) NOT NULL DEFAULT 0,
  "formaPagamento" TEXT NOT NULL DEFAULT 'dinheiro'
    CHECK ("formaPagamento" IN ('dinheiro','pix','cartao')),
  observacoes TEXT,
  "dataAcerto" TIMESTAMPTZ DEFAULT now(),
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- ─── ÍNDICES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_consignacoes_loja ON consignacoes (loja_id);
CREATE INDEX IF NOT EXISTS idx_consignacoes_cliente ON consignacoes ("clienteId");
CREATE INDEX IF NOT EXISTS idx_consignacoes_status ON consignacoes (status);
CREATE INDEX IF NOT EXISTS idx_acertos_loja ON consignacao_acertos (loja_id);
CREATE INDEX IF NOT EXISTS idx_acertos_consignacao ON consignacao_acertos ("consignacaoId");

-- ─── TRIGGER updatedAt ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at ON consignacoes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON consignacoes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE consignacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignacao_acertos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Isolamento por Loja" ON consignacoes;
CREATE POLICY "Isolamento por Loja" ON consignacoes FOR ALL USING (loja_id = auth.uid());

DROP POLICY IF EXISTS "Isolamento por Loja" ON consignacao_acertos;
CREATE POLICY "Isolamento por Loja" ON consignacao_acertos FOR ALL USING (loja_id = auth.uid());
