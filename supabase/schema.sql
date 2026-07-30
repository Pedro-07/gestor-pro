-- ============================================================================
-- APP GESTÃO — Supabase Schema (Multi-Tenant / SaaS)
-- Execute este SQL no SQL Editor do Supabase Dashboard
-- Todas as tabelas possuem loja_id vinculada ao auth.uid() do usuário logado.
-- ============================================================================

-- ─── LIMPEZA PRÉVIA ──────────────────────────────────────────────────────────
-- Remove as tabelas antigas para recriá-las com a nova arquitetura SaaS
DROP TABLE IF EXISTS consignacao_acertos CASCADE;
DROP TABLE IF EXISTS consignacoes CASCADE;
DROP TABLE IF EXISTS movimentacoes CASCADE;
DROP TABLE IF EXISTS parcelas CASCADE;
DROP TABLE IF EXISTS vendas CASCADE;
DROP TABLE IF EXISTS produtos CASCADE;
DROP TABLE IF EXISTS fornecedores CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS config CASCADE;
DROP TABLE IF EXISTS perfis CASCADE;

-- ─── CLIENTES ────────────────────────────────────────────────────────────────
CREATE TABLE clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL DEFAULT auth.uid(),
  codigo TEXT NOT NULL DEFAULT '',
  nome TEXT NOT NULL,
  "cpfCnpj" TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  endereco TEXT NOT NULL DEFAULT '',
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inadimplente', 'inativo')),
  "motivoInadimplencia" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- ─── FORNECEDORES ────────────────────────────────────────────────────────────
CREATE TABLE fornecedores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL DEFAULT auth.uid(),
  nome TEXT NOT NULL,
  contato TEXT,
  telefone TEXT,
  cidade TEXT,
  observacoes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- ─── PRODUTOS ────────────────────────────────────────────────────────────────
CREATE TABLE produtos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL DEFAULT auth.uid(),
  codigo TEXT NOT NULL DEFAULT '',
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT NOT NULL DEFAULT 'outro'
    CHECK (categoria IN ('camiseta','calca','vestido','saia','blusa','short','jaqueta','conjunto','outro')),
  "precoCusto" NUMERIC(10,2) NOT NULL DEFAULT 0,
  "precoVenda" NUMERIC(10,2) NOT NULL DEFAULT 0,
  estoque JSONB NOT NULL DEFAULT '{"PP":0,"P":0,"M":0,"G":0,"GG":0,"XGG":0}',
  "fotoUrl" TEXT,
  "codigoBarras" TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  "fornecedorId" UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
  "fornecedorNome" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- ─── VENDAS ──────────────────────────────────────────────────────────────────
CREATE TABLE vendas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL DEFAULT auth.uid(),
  "clienteId" UUID NOT NULL REFERENCES clientes(id),
  "clienteNome" TEXT NOT NULL,
  "clienteCidade" TEXT NOT NULL DEFAULT '',
  itens JSONB NOT NULL DEFAULT '[]',
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  "formaPagamento" TEXT NOT NULL DEFAULT 'dinheiro'
    CHECK ("formaPagamento" IN ('dinheiro','pix','cartao','promissoria')),
  entrada NUMERIC(10,2) DEFAULT 0,
  "numeroParcelas" INT DEFAULT 1,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'paga'
    CHECK (status IN ('paga','parcialmente_paga','pendente','atrasada','cancelada')),
  "dataVenda" TIMESTAMPTZ DEFAULT now(),
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- ─── PARCELAS ────────────────────────────────────────────────────────────────
CREATE TABLE parcelas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL DEFAULT auth.uid(),
  "vendaId" UUID NOT NULL REFERENCES vendas(id),
  "clienteId" UUID NOT NULL REFERENCES clientes(id),
  "clienteNome" TEXT NOT NULL,
  "clienteTelefone" TEXT NOT NULL DEFAULT '',
  numero INT NOT NULL DEFAULT 0,
  "totalParcelas" INT NOT NULL DEFAULT 1,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  "valorPago" NUMERIC(10,2) NOT NULL DEFAULT 0,
  "dataVencimento" TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','paga','atrasada','parcialmente_paga','cancelada')),
  pagamentos JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

-- ─── MOVIMENTAÇÕES DE ESTOQUE ────────────────────────────────────────────────
CREATE TABLE movimentacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL DEFAULT auth.uid(),
  "produtoId" UUID NOT NULL REFERENCES produtos(id),
  "produtoNome" TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  tamanho TEXT NOT NULL,
  quantidade INT NOT NULL DEFAULT 0,
  motivo TEXT NOT NULL DEFAULT '',
  "vendaId" UUID REFERENCES vendas(id),
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- ─── CONSIGNAÇÕES ────────────────────────────────────────────────────────────
CREATE TABLE consignacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL DEFAULT auth.uid(),
  "clienteId" UUID NOT NULL REFERENCES clientes(id),
  "clienteNome" TEXT NOT NULL,
  "clienteCidade" TEXT NOT NULL DEFAULT '',
  "clienteTelefone" TEXT NOT NULL DEFAULT '',
  itens JSONB NOT NULL DEFAULT '[]',
  "totalEntregue" NUMERIC(10,2) NOT NULL DEFAULT 0,
  "totalRecebido" NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta','fechada','cancelada')),
  observacoes TEXT,
  "dataEntrega" TIMESTAMPTZ DEFAULT now(),
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE consignacao_acertos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id UUID NOT NULL DEFAULT auth.uid(),
  "consignacaoId" UUID NOT NULL REFERENCES consignacoes(id) ON DELETE CASCADE,
  "clienteId" UUID NOT NULL REFERENCES clientes(id),
  "clienteNome" TEXT NOT NULL,
  itens JSONB NOT NULL DEFAULT '[]',
  "valorRecebido" NUMERIC(10,2) NOT NULL DEFAULT 0,
  "formaPagamento" TEXT NOT NULL DEFAULT 'dinheiro'
    CHECK ("formaPagamento" IN ('dinheiro','pix','cartao')),
  observacoes TEXT,
  "dataAcerto" TIMESTAMPTZ DEFAULT now(),
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- ─── CONFIGURAÇÕES ───────────────────────────────────────────────────────────
CREATE TABLE config (
  loja_id UUID PRIMARY KEY DEFAULT auth.uid(),
  "nomeVendedor" TEXT NOT NULL DEFAULT '',
  "telefoneVendedor" TEXT NOT NULL DEFAULT '',
  "templateCobranca" TEXT NOT NULL DEFAULT '',
  "templateInadimplente" TEXT NOT NULL DEFAULT '',
  "templateConfirmacaoPagamento" TEXT NOT NULL DEFAULT '',
  "nomeApp" TEXT DEFAULT 'Stok Master',
  "logoUrl" TEXT,
  "usarTamanhos" BOOLEAN DEFAULT TRUE,
  "usarFornecedor" BOOLEAN DEFAULT FALSE,
  "usarObservacoes" BOOLEAN DEFAULT FALSE,
  tamanhos JSONB DEFAULT '["PP","P","M","G","GG","XGG"]'
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_clientes_loja ON clientes (loja_id);
CREATE INDEX idx_clientes_nome ON clientes (nome);
CREATE INDEX idx_produtos_loja ON produtos (loja_id);
CREATE INDEX idx_produtos_codigo ON produtos (codigo);
CREATE INDEX idx_vendas_loja ON vendas (loja_id);
CREATE INDEX idx_vendas_cliente ON vendas ("clienteId");
CREATE INDEX idx_parcelas_loja ON parcelas (loja_id);
CREATE INDEX idx_parcelas_venda ON parcelas ("vendaId");
CREATE INDEX idx_parcelas_cliente ON parcelas ("clienteId");
CREATE INDEX idx_movimentacoes_loja ON movimentacoes (loja_id);
CREATE INDEX idx_movimentacoes_produto ON movimentacoes ("produtoId");
CREATE INDEX idx_consignacoes_loja ON consignacoes (loja_id);
CREATE INDEX idx_consignacoes_cliente ON consignacoes ("clienteId");
CREATE INDEX idx_consignacoes_status ON consignacoes (status);
CREATE INDEX idx_acertos_loja ON consignacao_acertos (loja_id);
CREATE INDEX idx_acertos_consignacao ON consignacao_acertos ("consignacaoId");

-- ─── TRIGGER: auto-update "updatedAt" ────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON fornecedores
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON produtos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON vendas
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON parcelas
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON consignacoes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── ROW LEVEL SECURITY (RLS) ────────────────────────────────────────────────
-- Habilitar RLS em todas as tabelas
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignacao_acertos ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Policies: usuários autenticados só podem acessar dados da própria loja (loja_id = auth.uid())
CREATE POLICY "Isolamento por Loja" ON clientes FOR ALL USING (loja_id = auth.uid());
CREATE POLICY "Isolamento por Loja" ON fornecedores FOR ALL USING (loja_id = auth.uid());
CREATE POLICY "Isolamento por Loja" ON produtos FOR ALL USING (loja_id = auth.uid());
CREATE POLICY "Isolamento por Loja" ON vendas FOR ALL USING (loja_id = auth.uid());
CREATE POLICY "Isolamento por Loja" ON parcelas FOR ALL USING (loja_id = auth.uid());
CREATE POLICY "Isolamento por Loja" ON movimentacoes FOR ALL USING (loja_id = auth.uid());
CREATE POLICY "Isolamento por Loja" ON consignacoes FOR ALL USING (loja_id = auth.uid());
CREATE POLICY "Isolamento por Loja" ON consignacao_acertos FOR ALL USING (loja_id = auth.uid());
CREATE POLICY "Isolamento por Loja" ON config FOR ALL USING (loja_id = auth.uid());

-- ─── STORAGE ─────────────────────────────────────────────────────────────────
-- Criar bucket para fotos
INSERT INTO storage.buckets (id, name, public) VALUES ('fotos', 'fotos', true)
  ON CONFLICT DO NOTHING;

-- Policies de storage
DROP POLICY IF EXISTS "Authenticated users upload" ON storage.objects;
CREATE POLICY "Authenticated users upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'fotos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public read fotos" ON storage.objects;
CREATE POLICY "Public read fotos" ON storage.objects
  FOR SELECT USING (bucket_id = 'fotos');

DROP POLICY IF EXISTS "Authenticated users delete" ON storage.objects;
CREATE POLICY "Authenticated users delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'fotos' AND auth.role() = 'authenticated');

-- ─── PERFIS E AUTENTICAÇÃO (SaaS) ────────────────────────────────────────────
CREATE TABLE perfis (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  nome_loja TEXT NOT NULL,
  telefone TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Isolamento por Perfil" ON perfis FOR ALL USING (id = auth.uid());

-- Trigger para criar perfil automaticamente no cadastro
CREATE OR REPLACE FUNCTION trigger_on_auth_user_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (id, nome, nome_loja, telefone, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', 'Administrador'),
    COALESCE(NEW.raw_user_meta_data->>'nome_loja', 'Nova Loja'),
    COALESCE(NEW.raw_user_meta_data->>'telefone', '000-' || left(NEW.id::text, 8)),
    NEW.email
  );
  
  -- Inicializa as configurações padrão da nova loja
  INSERT INTO public.config (loja_id, "nomeApp", "nomeVendedor", "telefoneVendedor")
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome_loja', 'Nova Loja'),
    COALESCE(NEW.raw_user_meta_data->>'nome', 'Administrador'),
    COALESCE(NEW.raw_user_meta_data->>'telefone', '000-' || left(NEW.id::text, 8))
  ) ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION trigger_on_auth_user_created();

-- ─── RPC: OBTER EMAIL PELO TELEFONE ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_email_by_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email FROM public.perfis WHERE telefone = p_phone LIMIT 1;
  RETURN v_email;
END;
$$;
