import { supabase } from './supabase'
import type {
  Cliente, Produto, Venda, Parcela, Fornecedor,
  Configuracoes, FormaPagamento, ItemVenda, Tamanho,
  MovimentacaoEstoque,
  Consignacao, AcertoConsignacao, FormaPagamentoRecebimento,
} from '@/types'

// ─── CLIENTES ────────────────────────────────────────────────────────────────

export async function fetchClientes(): Promise<Cliente[]> {
  const { data, error } = await supabase.from('clientes').select('*').order('nome')
  if (error) throw error
  return data as Cliente[]
}

export async function fetchClienteById(id: string): Promise<Cliente> {
  const { data, error } = await supabase.from('clientes').select('*').eq('id', id).single()
  if (error) throw error
  return data as Cliente
}

export async function insertCliente(cliente: Partial<Cliente>) {
  const { error } = await supabase.from('clientes').insert(cliente)
  if (error) throw error
}

export async function updateCliente(id: string, data: Partial<Cliente>) {
  const { error } = await supabase.from('clientes').update(data).eq('id', id)
  if (error) throw error
}

export async function deleteCliente(id: string) {
  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) throw error
}

// ─── FORNECEDORES ────────────────────────────────────────────────────────────

export async function fetchFornecedores(): Promise<Fornecedor[]> {
  const { data, error } = await supabase.from('fornecedores').select('*').order('nome')
  if (error) throw error
  return data as Fornecedor[]
}

export async function insertFornecedor(f: Partial<Fornecedor>) {
  const { error } = await supabase.from('fornecedores').insert(f)
  if (error) throw error
}

export async function updateFornecedor(id: string, data: Partial<Fornecedor>) {
  const { error } = await supabase.from('fornecedores').update(data).eq('id', id)
  if (error) throw error
}

export async function deleteFornecedor(id: string) {
  const { error } = await supabase.from('fornecedores').delete().eq('id', id)
  if (error) throw error
}

// ─── PRODUTOS ────────────────────────────────────────────────────────────────

export async function fetchProdutos(): Promise<Produto[]> {
  const { data, error } = await supabase.from('produtos').select('*').order('codigo')
  if (error) throw error
  return data as Produto[]
}

export async function fetchProdutosByNome(): Promise<Produto[]> {
  const { data, error } = await supabase.from('produtos').select('*').order('nome')
  if (error) throw error
  return data as Produto[]
}

export async function insertProduto(p: Partial<Produto>) {
  const { error } = await supabase.from('produtos').insert(p)
  if (error) throw error
}

export async function updateProduto(id: string, data: Partial<Produto>) {
  const { error } = await supabase.from('produtos').update(data).eq('id', id)
  if (error) throw error
}

export async function deleteProduto(id: string) {
  const { error } = await supabase.from('produtos').delete().eq('id', id)
  if (error) throw error
}

// ─── VENDAS ──────────────────────────────────────────────────────────────────

export async function fetchVendas(): Promise<Venda[]> {
  const { data, error } = await supabase.from('vendas').select('*').order('createdAt', { ascending: false })
  if (error) throw error
  return data as Venda[]
}

export async function fetchVendaById(id: string): Promise<Venda | null> {
  const { data, error } = await supabase.from('vendas').select('*').eq('id', id).single()
  if (error) throw error
  return data as Venda
}

export async function fetchVendasByCliente(clienteId: string): Promise<Venda[]> {
  const { data, error } = await supabase
    .from('vendas').select('*')
    .eq('clienteId', clienteId)
    .order('createdAt', { ascending: false })
  if (error) throw error
  return data as Venda[]
}

/**
 * Executa uma venda completa:
 * 1. Valida estoque
 * 2. Insere a venda
 * 3. Atualiza estoque
 * 4. Cria movimentações
 * 5. Cria parcelas (se promissória)
 */
export async function executarVenda(params: {
  clienteId: string
  clienteNome: string
  clienteCidade: string
  itens: ItemVenda[]
  total: number
  formaPagamento: FormaPagamento
  entrada?: number
  numeroParcelas?: number
  observacoes?: string
  parcelas?: Array<{
    clienteNome: string
    clienteTelefone: string
    numero: number
    totalParcelas: number
    valor: number
    valorPago: number
    dataVencimento: string
    status: string
    pagamentos: unknown[]
  }>
}): Promise<string> {
  // Toda a operação roda numa única transação no Postgres (RPC executar_venda):
  // valida + trava o estoque (FOR UPDATE), insere a venda, baixa o estoque,
  // cria movimentações e parcelas. Falha em qualquer passo reverte tudo.
  const { data, error } = await supabase.rpc('executar_venda', {
    p_cliente_id: params.clienteId,
    p_cliente_nome: params.clienteNome,
    p_cliente_cidade: params.clienteCidade,
    p_itens: params.itens,
    p_total: params.total,
    p_forma_pagamento: params.formaPagamento,
    p_entrada: params.entrada ?? 0,
    p_numero_parcelas: params.numeroParcelas ?? 1,
    p_observacoes: params.observacoes ?? '',
    p_parcelas: params.parcelas ?? [],
  })
  if (error) throw new Error(error.message)
  return data as string
}

/**
 * Cancela uma venda: restaura estoque, cancela parcelas pendentes.
 * Transacional (RPC cancelar_venda) — lê os itens/parcelas direto do banco.
 */
export async function cancelarVenda(vendaId: string) {
  const { error } = await supabase.rpc('cancelar_venda', { p_venda_id: vendaId })
  if (error) throw new Error(error.message)
}

/**
 * Edita uma venda: atualiza cliente, forma de pagamento e quantidades.
 */
export async function editarVenda(params: {
  vendaId: string
  clienteId: string
  clienteNome: string
  clienteCidade: string
  formaPagamento: FormaPagamento
  itensOriginal: ItemVenda[]
  itensAtualizado: ItemVenda[]
  novoTotal: number
}) {
  // Transacional (RPC editar_venda): ajusta o estoque pelas diferenças de
  // quantidade (com trava) e atualiza a venda numa única transação.
  const { error } = await supabase.rpc('editar_venda', {
    p_venda_id: params.vendaId,
    p_cliente_id: params.clienteId,
    p_cliente_nome: params.clienteNome,
    p_cliente_cidade: params.clienteCidade,
    p_forma_pagamento: params.formaPagamento,
    p_itens_original: params.itensOriginal,
    p_itens_atualizado: params.itensAtualizado,
    p_novo_total: params.novoTotal,
  })
  if (error) throw new Error(error.message)
}

// ─── CONSIGNAÇÃO ─────────────────────────────────────────────────────────────

export async function fetchConsignacoes(): Promise<Consignacao[]> {
  const { data, error } = await supabase
    .from('consignacoes').select('*').order('createdAt', { ascending: false })
  if (error) throw error
  return data as Consignacao[]
}

export async function fetchConsignacaoById(id: string): Promise<Consignacao | null> {
  const { data, error } = await supabase.from('consignacoes').select('*').eq('id', id).single()
  if (error) throw error
  return data as Consignacao
}

export async function fetchAcertosByConsignacao(consignacaoId: string): Promise<AcertoConsignacao[]> {
  const { data, error } = await supabase
    .from('consignacao_acertos').select('*')
    .eq('consignacaoId', consignacaoId)
    .order('createdAt', { ascending: false })
  if (error) throw error
  return data as AcertoConsignacao[]
}

/**
 * Cria uma consignação (entrega de peças ao lojista):
 * 1. Valida estoque
 * 2. Baixa o estoque (as peças saem para o lojista)
 * 3. Registra movimentações de saída
 * 4. Cria a consignação com status 'aberta'
 * Nada é faturado aqui — o faturamento só acontece nos acertos.
 */
export async function criarConsignacao(params: {
  clienteId: string
  clienteNome: string
  clienteCidade: string
  clienteTelefone: string
  itens: Array<{ produtoId: string; produtoNome: string; tamanho: Tamanho; quantidade: number; precoUnitario: number }>
  observacoes?: string
}): Promise<string> {
  // Transacional (RPC criar_consignacao): valida + trava o estoque, cria a
  // consignação, baixa o estoque e registra as movimentações numa transação.
  const { data, error } = await supabase.rpc('criar_consignacao', {
    p_cliente_id: params.clienteId,
    p_cliente_nome: params.clienteNome,
    p_cliente_cidade: params.clienteCidade,
    p_cliente_telefone: params.clienteTelefone,
    p_itens: params.itens,
    p_observacoes: params.observacoes ?? '',
  })
  if (error) throw new Error(error.message)
  return data as string
}

/**
 * Registra um acerto (prestação de contas parcial) de uma consignação:
 * - Soma as vendidas/devolvidas de cada item (validando contra o pendente)
 * - Devolvidas voltam ao estoque (entrada + movimentação)
 * - Vendidas geram valor recebido = qtd × preço de repasse
 * - Fecha a consignação se todas as peças já foram acertadas
 */
export async function registrarAcerto(params: {
  consignacao: Consignacao
  itens: Array<{ produtoId: string; produtoNome: string; tamanho: Tamanho; vendidas: number; devolvidas: number }>
  formaPagamento: FormaPagamentoRecebimento
  observacoes?: string
}): Promise<void> {
  // Transacional (RPC registrar_acerto): trava a consignação (FOR UPDATE),
  // valida o pendente contra o estado ATUAL do banco (não o cache do cliente),
  // devolve ao estoque, registra o acerto e atualiza totais/status.
  const { error } = await supabase.rpc('registrar_acerto', {
    p_consignacao_id: params.consignacao.id,
    p_itens: params.itens.map(({ produtoId, tamanho, vendidas, devolvidas }) => ({ produtoId, tamanho, vendidas, devolvidas })),
    p_forma_pagamento: params.formaPagamento,
    p_observacoes: params.observacoes ?? '',
  })
  if (error) throw new Error(error.message)
}

// ─── PARCELAS ────────────────────────────────────────────────────────────────

export async function fetchParcelas(): Promise<Parcela[]> {
  const { data, error } = await supabase.from('parcelas').select('*')
  if (error) throw error
  return data as Parcela[]
}

export async function fetchParcelasByVenda(vendaId: string): Promise<Parcela[]> {
  const { data, error } = await supabase
    .from('parcelas').select('*').eq('vendaId', vendaId).order('numero')
  if (error) throw error
  return data as Parcela[]
}

export async function fetchParcelasByCliente(clienteId: string): Promise<Parcela[]> {
  const { data, error } = await supabase
    .from('parcelas').select('*').eq('clienteId', clienteId)
  if (error) throw error
  return data as Parcela[]
}

export async function registrarPagamento(
  parcelaId: string,
  parcela: Parcela,
  pagamento: { valor: number; dataPagamento: string; formaPagamento: FormaPagamento; observacoes?: string }
) {
  const novoValorPago = parcela.valorPago + pagamento.valor
  const saldo = parcela.valor - novoValorPago
  const novoStatus = saldo <= 0 ? 'paga' : 'parcialmente_paga'

  const novoPagamento = {
    id: Date.now().toString(),
    valor: pagamento.valor,
    dataPagamento: new Date(pagamento.dataPagamento + 'T12:00:00').toISOString(),
    formaPagamento: pagamento.formaPagamento,
    observacoes: pagamento.observacoes ?? '',
  }

  const { error } = await supabase.from('parcelas').update({
    valorPago: novoValorPago,
    status: novoStatus,
    pagamentos: [...(parcela.pagamentos ?? []), novoPagamento],
  }).eq('id', parcelaId)
  if (error) throw error
}

export async function atualizarParcelasVencidas(parcelas: Parcela[]) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const vencidas = parcelas.filter((p) => {
    if (p.status !== 'pendente') return false
    const dueDate = new Date(p.dataVencimento)
    return dueDate < today
  })

  if (vencidas.length === 0) return

  const ids = vencidas.map((p) => p.id)
  const { error } = await supabase
    .from('parcelas')
    .update({ status: 'atrasada' })
    .in('id', ids)
  if (error) throw error
}

// ─── MOVIMENTAÇÕES ───────────────────────────────────────────────────────────

export async function insertMovimentacao(mov: {
  produtoId: string
  produtoNome: string
  tipo: 'entrada' | 'saida'
  tamanho: Tamanho
  quantidade: number
  motivo: string
  vendaId?: string
}) {
  const { error } = await supabase.from('movimentacoes').insert(mov)
  if (error) throw error
}

export async function fetchMovimentacoesByProduto(produtoId: string): Promise<MovimentacaoEstoque[]> {
  const { data, error } = await supabase
    .from('movimentacoes')
    .select('*')
    .eq('produtoId', produtoId)
    .order('createdAt', { ascending: false })
  if (error) throw error
  return data as MovimentacaoEstoque[]
}

// ─── CONFIGURAÇÕES ───────────────────────────────────────────────────────────

export async function fetchConfig(): Promise<Configuracoes | null> {
  // RLS (loja_id = auth.uid()) irá garantir que só retorne a config daquele lojista
  const { data, error } = await supabase.from('config').select('*').maybeSingle()
  if (error) return null
  return data as Configuracoes
}

export async function saveConfig(config: Partial<Configuracoes>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')
  const { error } = await supabase.from('config').upsert({ loja_id: user.id, ...config })
  if (error) throw error
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

export async function fetchDashboardData() {
  const [parcelasRes, clientesRes, produtosRes, vendasRes] = await Promise.all([
    supabase.from('parcelas').select('*'),
    supabase.from('clientes').select('*').eq('status', 'inadimplente'),
    supabase.from('produtos').select('*'),
    supabase.from('vendas').select('*').order('createdAt', { ascending: false }).limit(5),
  ])

  return {
    parcelas: (parcelasRes.data ?? []) as Parcela[],
    clientesInadimplentes: (clientesRes.data ?? []) as Cliente[],
    produtos: (produtosRes.data ?? []) as Produto[],
    ultimasVendas: (vendasRes.data ?? []) as Venda[],
  }
}

// ─── RELATÓRIOS ──────────────────────────────────────────────────────────────

export async function fetchRelatoriosData() {
  const [vendasRes, parcelasRes, produtosRes, acertosRes] = await Promise.all([
    supabase.from('vendas').select('*'),
    supabase.from('parcelas').select('*'),
    supabase.from('produtos').select('*'),
    supabase.from('consignacao_acertos').select('*'),
  ])

  return {
    vendas: (vendasRes.data ?? []) as Venda[],
    parcelas: (parcelasRes.data ?? []) as Parcela[],
    produtos: (produtosRes.data ?? []) as Produto[],
    acertos: (acertosRes.data ?? []) as AcertoConsignacao[],
  }
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────

export async function uploadFile(path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from('fotos').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('fotos').getPublicUrl(path)
  return data.publicUrl
}
