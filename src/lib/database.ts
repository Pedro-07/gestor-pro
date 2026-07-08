import { supabase } from './supabase'
import type {
  Cliente, Produto, Venda, Parcela, Fornecedor,
  Configuracoes, FormaPagamento, ItemVenda, Tamanho,
  MovimentacaoEstoque,
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
  const config = await fetchConfig()
  const usarTamanhos = config?.usarTamanhos !== false

  // 1. Validar estoque
  for (const item of params.itens) {
    const { data: produto, error } = await supabase
      .from('produtos').select('estoque').eq('id', item.produtoId).single()
    if (error) throw new Error(`Produto "${item.produtoNome}" não encontrado`)
    
    if (usarTamanhos) {
      const disponivel = ((produto.estoque as Record<string, number>)[item.tamanho]) ?? 0
      if (disponivel < item.quantidade) {
        throw new Error(
          `Estoque insuficiente: ${item.produtoNome} tam. ${item.tamanho} — disponível: ${disponivel}, solicitado: ${item.quantidade}`
        )
      }
    } else {
      const totalDisponivel = Object.values(produto.estoque as Record<string, number>).reduce((a, b) => a + b, 0)
      if (totalDisponivel < item.quantidade) {
        throw new Error(
          `Estoque insuficiente: ${item.produtoNome} — disponível: ${totalDisponivel}, solicitado: ${item.quantidade}`
        )
      }
    }
  }

  // 2. Inserir venda
  const isPromissoria = params.formaPagamento === 'promissoria'
  const { data: venda, error: vendaError } = await supabase.from('vendas').insert({
    clienteId: params.clienteId,
    clienteNome: params.clienteNome,
    clienteCidade: params.clienteCidade,
    itens: params.itens,
    total: params.total,
    formaPagamento: params.formaPagamento,
    entrada: params.entrada ?? 0,
    numeroParcelas: params.numeroParcelas ?? 1,
    observacoes: params.observacoes ?? '',
    status: isPromissoria ? 'pendente' : 'paga',
  }).select('id').single()
  if (vendaError) throw vendaError

  const vendaId = venda.id

  // 3. Atualizar estoque + movimentações
  for (const item of params.itens) {
    const { data: produto } = await supabase
      .from('produtos').select('estoque').eq('id', item.produtoId).single()
    if (produto) {
      const novoEstoque = { ...(produto.estoque as Record<string, number>) }
      if (usarTamanhos) {
        novoEstoque[item.tamanho] = (novoEstoque[item.tamanho] ?? 0) - item.quantidade
      } else {
        const totalDisponivel = Object.values(produto.estoque as Record<string, number>).reduce((a, b) => a + b, 0)
        novoEstoque.PP = 0
        novoEstoque.P = 0
        novoEstoque.M = totalDisponivel - item.quantidade
        novoEstoque.G = 0
        novoEstoque.GG = 0
        novoEstoque.XGG = 0
      }
      await supabase.from('produtos').update({ estoque: novoEstoque }).eq('id', item.produtoId)
    }
    await supabase.from('movimentacoes').insert({
      produtoId: item.produtoId,
      produtoNome: item.produtoNome,
      tipo: 'saida',
      tamanho: usarTamanhos ? item.tamanho : 'M',
      quantidade: item.quantidade,
      motivo: 'Venda',
      vendaId,
    })
  }

  // 4. Criar parcelas
  if (params.parcelas && params.parcelas.length > 0) {
    const parcelasToInsert = params.parcelas.map((p) => ({
      ...p,
      vendaId,
      clienteId: params.clienteId,
    }))
    const { error: parcelasError } = await supabase.from('parcelas').insert(parcelasToInsert)
    if (parcelasError) throw parcelasError
  }

  return vendaId
}

/**
 * Cancela uma venda: restaura estoque, cancela parcelas pendentes.
 */
export async function cancelarVenda(vendaId: string, itens: ItemVenda[], parcelas: Parcela[]) {
  const config = await fetchConfig()
  const usarTamanhos = config?.usarTamanhos !== false

  // Cancelar venda
  await supabase.from('vendas').update({ status: 'cancelada' }).eq('id', vendaId)

  // Cancelar parcelas pendentes
  for (const p of parcelas) {
    if (p.status !== 'paga') {
      await supabase.from('parcelas').update({ status: 'cancelada' }).eq('id', p.id)
    }
  }

  // Restaurar estoque
  for (const item of itens) {
    const { data: produto } = await supabase
      .from('produtos').select('estoque').eq('id', item.produtoId).single()
    if (produto) {
      const novoEstoque = { ...(produto.estoque as Record<string, number>) }
      if (usarTamanhos) {
        novoEstoque[item.tamanho] = (novoEstoque[item.tamanho] ?? 0) + item.quantidade
      } else {
        const totalDisponivel = Object.values(produto.estoque as Record<string, number>).reduce((a, b) => a + b, 0)
        novoEstoque.PP = 0
        novoEstoque.P = 0
        novoEstoque.M = totalDisponivel + item.quantidade
        novoEstoque.G = 0
        novoEstoque.GG = 0
        novoEstoque.XGG = 0
      }
      await supabase.from('produtos').update({ estoque: novoEstoque }).eq('id', item.produtoId)
      await supabase.from('movimentacoes').insert({
        produtoId: item.produtoId,
        produtoNome: item.produtoNome,
        tipo: 'entrada',
        tamanho: usarTamanhos ? item.tamanho : 'M',
        quantidade: item.quantidade,
        motivo: 'Cancelamento da venda',
        vendaId,
      })
    }
  }
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
  const config = await fetchConfig()
  const usarTamanhos = config?.usarTamanhos !== false

  // Ajustar estoque para diferenças de quantidade
  for (let i = 0; i < params.itensOriginal.length; i++) {
    const oldItem = params.itensOriginal[i]
    const newItem = params.itensAtualizado[i]
    const delta = newItem.quantidade - oldItem.quantidade
    if (delta !== 0) {
      const { data: produto } = await supabase
        .from('produtos').select('estoque').eq('id', oldItem.produtoId).single()
      if (produto) {
        const estoque = { ...(produto.estoque as Record<string, number>) }
        if (usarTamanhos) {
          estoque[oldItem.tamanho] = (estoque[oldItem.tamanho] ?? 0) - delta
          if (estoque[oldItem.tamanho] < 0) {
            throw new Error(`Estoque insuficiente para ${oldItem.produtoNome} (${oldItem.tamanho})`)
          }
        } else {
          const totalDisponivel = Object.values(produto.estoque as Record<string, number>).reduce((a, b) => a + b, 0)
          estoque.PP = 0
          estoque.P = 0
          estoque.M = totalDisponivel - delta
          estoque.G = 0
          estoque.GG = 0
          estoque.XGG = 0
          if (estoque.M < 0) {
            throw new Error(`Estoque insuficiente para ${oldItem.produtoNome}`)
          }
        }
        await supabase.from('produtos').update({ estoque }).eq('id', oldItem.produtoId)
      }
    }
  }

  // Atualizar venda
  await supabase.from('vendas').update({
    clienteId: params.clienteId,
    clienteNome: params.clienteNome,
    clienteCidade: params.clienteCidade,
    formaPagamento: params.formaPagamento,
    itens: params.itensAtualizado,
    total: params.novoTotal,
  }).eq('id', params.vendaId)
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
  const [vendasRes, parcelasRes, produtosRes] = await Promise.all([
    supabase.from('vendas').select('*'),
    supabase.from('parcelas').select('*'),
    supabase.from('produtos').select('*'),
  ])

  return {
    vendas: (vendasRes.data ?? []) as Venda[],
    parcelas: (parcelasRes.data ?? []) as Parcela[],
    produtos: (produtosRes.data ?? []) as Produto[],
  }
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────

export async function uploadFile(path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from('fotos').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('fotos').getPublicUrl(path)
  return data.publicUrl
}
