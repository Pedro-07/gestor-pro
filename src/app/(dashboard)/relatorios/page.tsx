'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchRelatoriosData, fetchClientes, fetchConfig } from '@/lib/database'
import { formatCurrency, formatDate } from '@/lib/utils'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Download, Users, Package, BarChart3, CalendarClock, AlertCircle, Boxes, Tags, CreditCard, MessageSquare } from 'lucide-react'

function getDate(ts: Date | string): Date {
  if (ts instanceof Date) return ts
  return new Date(ts)
}

type Periodo = 'mes_atual' | 'mes_passado' | 'semana' | 'ano'

function getPeriodoInterval(periodo: Periodo) {
  const now = new Date()
  switch (periodo) {
    case 'mes_atual':
      return { start: startOfMonth(now), end: endOfMonth(now) }
    case 'mes_passado': {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) }
    }
    case 'semana':
      return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) }
    case 'ano':
      return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31) }
  }
}

export default function RelatoriosPage() {
  const [periodo, setPeriodo] = useState<Periodo>('mes_atual')
  const [activeReport, setActiveReport] = useState<'fluxo' | 'clientes' | 'produtos' | 'receber' | 'estoque_saude' | 'categorias' | 'pagamentos'>('fluxo')
  const { data, isLoading: loadingRelatorios } = useQuery({ queryKey: ['relatorios'], queryFn: fetchRelatoriosData })
  const { data: clientes = [], isLoading: loadingClientes } = useQuery({ queryKey: ['clientes'], queryFn: fetchClientes })
  const { data: config, isLoading: loadingConfig } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })

  if (loadingRelatorios || loadingClientes || loadingConfig) {
    return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
  }

  const { vendas = [], parcelas = [], produtos = [], acertos = [] } = data ?? {}
  const interval = getPeriodoInterval(periodo)

  const vendasPeriodo = vendas.filter((v) =>
    isWithinInterval(getDate(v.createdAt), interval)
  )

  const totalVendasPeriodo = vendasPeriodo.reduce((acc, v) => acc + v.total, 0)

  // Recebido de consignação no período (acertos pagos)
  const recebidoConsignacaoPeriodo = acertos
    .filter((a) => isWithinInterval(getDate(a.dataAcerto), interval))
    .reduce((s, a) => s + (a.valorRecebido ?? 0), 0)

  const totalRecebidoPeriodo = parcelas.reduce((acc, p) => {
    const pagsPeriodo = (p.pagamentos ?? []).filter((pg) =>
      isWithinInterval(getDate(pg.dataPagamento), interval)
    )
    return acc + pagsPeriodo.reduce((s, pg) => s + pg.valor, 0)
  }, 0) + recebidoConsignacaoPeriodo

  const clienteMap: Record<string, { nome: string; total: number; vendas: number }> = {}
  vendasPeriodo.forEach((v) => {
    if (!clienteMap[v.clienteId]) clienteMap[v.clienteId] = { nome: v.clienteNome, total: 0, vendas: 0 }
    clienteMap[v.clienteId].total += v.total
    clienteMap[v.clienteId].vendas++
  })
  const rankingClientes = Object.values(clienteMap).sort((a, b) => b.total - a.total).slice(0, 10)

  const produtoMap: Record<string, { nome: string; quantidade: number; receita: number }> = {}
  vendasPeriodo.forEach((v) => {
    v.itens.forEach((item) => {
      if (!produtoMap[item.produtoId]) produtoMap[item.produtoId] = { nome: item.produtoNome, quantidade: 0, receita: 0 }
      produtoMap[item.produtoId].quantidade += item.quantidade
      produtoMap[item.produtoId].receita += item.subtotal
    })
  })
  const rankingProdutos = Object.values(produtoMap).sort((a, b) => b.quantidade - a.quantidade).slice(0, 10)

  const fluxoMensal = Array.from({ length: 6 }, (_, i) => {
    const date = new Date()
    date.setMonth(date.getMonth() - (5 - i))
    const start = startOfMonth(date)
    const end = endOfMonth(date)
    const entradasParcelas = parcelas.reduce((acc, p) => {
      const pags = (p.pagamentos ?? []).filter((pg) => isWithinInterval(getDate(pg.dataPagamento), { start, end }))
      return acc + pags.reduce((s, pg) => s + pg.valor, 0)
    }, 0)
    const entradasConsignacao = acertos
      .filter((a) => isWithinInterval(getDate(a.dataAcerto), { start, end }))
      .reduce((s, a) => s + (a.valorRecebido ?? 0), 0)
    const entradas = entradasParcelas + entradasConsignacao
    const vendas_ = vendas.filter((v) => isWithinInterval(getDate(v.createdAt), { start, end }))
      .reduce((acc, v) => acc + v.total, 0)
    return { mes: format(date, 'MMM/yy', { locale: ptBR }), entradas, vendas: vendas_ }
  })

  // Encontrar o maior valor de faturamento para servir de base nas barras
  const maxFluxoVal = Math.max(...fluxoMensal.map((f) => Math.max(f.vendas, f.entradas)), 1)

  // ─── 1. CONTAS A RECEBER (INADIMPLÊNCIA) ───
  const hoje = new Date()
  const parcelasVencidas = parcelas.filter((p) => {
    if (p.status === 'paga') return false
    const vencimento = getDate(p.dataVencimento)
    return vencimento < hoje && format(vencimento, 'yyyy-MM-dd') !== format(hoje, 'yyyy-MM-dd')
  })

  const inadimplenciaMap: Record<string, { 
    clienteId: string
    clienteNome: string
    telefone: string
    cidade: string
    valorPendente: number
    parcelasAtrasadas: number
    dataMaisAntiga: Date
  }> = {}

  parcelasVencidas.forEach((p) => {
    const venda = vendas.find((v) => v.id === p.vendaId)
    if (!venda) return

    const clienteId = venda.clienteId
    const cliente = clientes.find((c) => c.id === clienteId)
    const telefone = cliente?.telefone || ''
    const cidade = cliente?.cidade || ''
    const valorAtrasado = p.valor - (p.valorPago || 0)

    if (!inadimplenciaMap[clienteId]) {
      inadimplenciaMap[clienteId] = {
        clienteId,
        clienteNome: venda.clienteNome,
        telefone,
        cidade,
        valorPendente: 0,
        parcelasAtrasadas: 0,
        dataMaisAntiga: getDate(p.dataVencimento),
      }
    }

    inadimplenciaMap[clienteId].valorPendente += valorAtrasado
    inadimplenciaMap[clienteId].parcelasAtrasadas++
    const dataVenc = getDate(p.dataVencimento)
    if (dataVenc < inadimplenciaMap[clienteId].dataMaisAntiga) {
      inadimplenciaMap[clienteId].dataMaisAntiga = dataVenc
    }
  })

  const listaInadimplencia = Object.values(inadimplenciaMap).sort((a, b) => b.valorPendente - a.valorPendente)
  const totalInadimplente = listaInadimplencia.reduce((acc, c) => acc + c.valorPendente, 0)

  // ─── 2. SAÚDE DO ESTOQUE (GIRO E REPOSIÇÃO) ───
  const estoqueCritico = produtos.map((p) => {
    const totalEstoque = Object.values(p.estoque).reduce((acc, q) => acc + q, 0)
    return { ...p, totalEstoque }
  }).filter((p) => p.totalEstoque < 5).sort((a, b) => a.totalEstoque - b.totalEstoque)

  const produtosSemGiro = produtos.filter((p) => {
    return !rankingProdutos.some((rp) => rp.nome === p.nome)
  }).map((p) => {
    const totalEstoque = Object.values(p.estoque).reduce((acc, q) => acc + q, 0)
    return { ...p, totalEstoque }
  }).sort((a, b) => b.totalEstoque - a.totalEstoque)

  // ─── 3. VENDAS POR CATEGORIA ───
  const categoriaMap: Record<string, { categoria: string; total: number; quantidade: number }> = {}
  vendasPeriodo.forEach((v) => {
    v.itens.forEach((item) => {
      const prod = produtos.find((p) => p.id === item.produtoId)
      const catName = prod?.categoria || 'Outros'
      const formattedCat = catName.trim() === '' ? 'Sem Categoria' : catName

      if (!categoriaMap[formattedCat]) {
        categoriaMap[formattedCat] = {
          categoria: formattedCat,
          total: 0,
          quantidade: 0,
        }
      }
      categoriaMap[formattedCat].total += item.subtotal
      categoriaMap[formattedCat].quantidade += item.quantidade
    })
  })
  const listaCategorias = Object.values(categoriaMap).sort((a, b) => b.total - a.total)
  const maxCategoriaVal = Math.max(...listaCategorias.map((c) => c.total), 1)

  // ─── 4. FORMAS DE PAGAMENTO ───
  const pagamentoMap: Record<string, { forma: string; total: number; vendas: number }> = {}
  const nomeFormaMap: Record<string, string> = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    cartao: 'Cartão',
    promissoria: 'Nota Promissória',
  }

  vendasPeriodo.forEach((v) => {
    const formaKey = v.formaPagamento || 'Outro'
    const label = nomeFormaMap[formaKey] || formaKey.charAt(0).toUpperCase() + formaKey.slice(1)
    
    if (!pagamentoMap[label]) {
      pagamentoMap[label] = {
        forma: label,
        total: 0,
        vendas: 0,
      }
    }
    pagamentoMap[label].total += v.total
    pagamentoMap[label].vendas++
  })

  const listaPagamentos = Object.values(pagamentoMap).sort((a, b) => b.total - a.total)
  const maxPagamentoVal = Math.max(...listaPagamentos.map((p) => p.total), 1)

  async function exportarExcel() {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    const vendasData = vendasPeriodo.map((v) => ({
      'Data': formatDate(getDate(v.createdAt)),
      'Cliente': v.clienteNome,
      'Cidade': v.clienteCidade,
      'Total (R$)': v.total,
      'Forma Pgto': v.formaPagamento,
      'Status': v.status,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vendasData), 'Vendas')

    const clientesData = rankingClientes.map((c, i) => ({
      '#': i + 1,
      'Cliente': c.nome,
      'Qtd Vendas': c.vendas,
      'Total (R$)': c.total,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientesData), 'Ranking Clientes')

    const produtosData = rankingProdutos.map((p, i) => ({
      '#': i + 1,
      'Produto': p.nome,
      'Qtd Vendida': p.quantidade,
      'Receita (R$)': p.receita,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(produtosData), 'Produtos')

    XLSX.writeFile(wb, `relatorio_${periodo}_${new Date().toISOString().split('T')[0]}.xlsx`)
    const { toast } = await import('sonner')
    toast.success('Arquivo Excel gerado!')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Select value={periodo} onValueChange={(v: string) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mes_atual">Mês Atual</SelectItem>
            <SelectItem value="mes_passado">Mês Passado</SelectItem>
            <SelectItem value="semana">Esta Semana</SelectItem>
            <SelectItem value="ano">Este Ano</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportarExcel} className="h-9">
          <Download className="mr-2 h-4 w-4" />Exportar Excel
        </Button>
      </div>

      {/* Cards de KPIs Principais no topo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card className="bg-card/45 backdrop-blur-sm border-border/80">
          <CardContent className="p-5 flex flex-col justify-between h-24">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendas no Período</span>
            <span className="text-3xl font-extrabold font-mono tracking-tight text-foreground">{vendasPeriodo.length}</span>
          </CardContent>
        </Card>
        <Card className="bg-card/45 backdrop-blur-sm border-border/80">
          <CardContent className="p-5 flex flex-col justify-between h-24">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Faturado</span>
            <span className="text-2xl font-extrabold font-mono tracking-tight text-blue-600 dark:text-blue-400">{formatCurrency(totalVendasPeriodo)}</span>
          </CardContent>
        </Card>
        <Card className="bg-card/45 backdrop-blur-sm border-border/80">
          <CardContent className="p-5 flex flex-col justify-between h-24">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Recebido</span>
            <span className="text-2xl font-extrabold font-mono tracking-tight text-green-600 dark:text-green-400">{formatCurrency(totalRecebidoPeriodo)}</span>
          </CardContent>
        </Card>
        <Card className="bg-card/45 backdrop-blur-sm border-border/80">
          <CardContent className="p-5 flex flex-col justify-between h-24">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ticket Médio</span>
            <span className="text-2xl font-extrabold font-mono tracking-tight text-foreground">{formatCurrency(vendasPeriodo.length > 0 ? totalVendasPeriodo / vendasPeriodo.length : 0)}</span>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-muted-foreground/80 uppercase tracking-wider">Selecione o Relatório Detalhado</h2>
        
        {/* Grid de Seletores por Cards Interativos (7 Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Card Seletor - Fluxo Mensal */}
          <div
            onClick={() => setActiveReport('fluxo')}
            className={`relative overflow-hidden rounded-2xl border p-5 cursor-pointer transition-all duration-200 select-none group flex flex-col justify-between h-36 ${
              activeReport === 'fluxo'
                ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/20 shadow-md'
                : 'border-border/80 bg-card hover:border-muted-foreground/30 hover:bg-muted/10'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-bold text-sm leading-none text-card-foreground group-hover:text-blue-500 transition-colors">
                  Fluxo Mensal
                </h3>
                <p className="text-xs text-muted-foreground leading-tight">
                  Faturamento vs Recebimento nos últimos 6 meses.
                </p>
              </div>
              <div className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                activeReport === 'fluxo' ? 'bg-blue-500/15 text-blue-500' : 'bg-muted text-muted-foreground group-hover:bg-blue-500/10 group-hover:text-blue-500'
              }`}>
                <BarChart3 className="h-5 w-5" />
              </div>
            </div>
            <div className="pt-3 border-t border-muted-foreground/10 flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Período</span>
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">6 Meses</span>
            </div>
          </div>

          {/* Card Seletor - Clientes */}
          <div
            onClick={() => setActiveReport('clientes')}
            className={`relative overflow-hidden rounded-2xl border p-5 cursor-pointer transition-all duration-200 select-none group flex flex-col justify-between h-36 ${
              activeReport === 'clientes'
                ? 'border-green-500 bg-green-500/5 ring-1 ring-green-500/20 shadow-md'
                : 'border-border/80 bg-card hover:border-muted-foreground/30 hover:bg-muted/10'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-bold text-sm leading-none text-card-foreground group-hover:text-green-500 transition-colors">
                  Clientes (Top 10)
                </h3>
                <p className="text-xs text-muted-foreground leading-tight">
                  Ranking dos clientes que mais geraram faturamento.
                </p>
              </div>
              <div className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                activeReport === 'clientes' ? 'bg-green-500/15 text-green-500' : 'bg-muted text-muted-foreground group-hover:bg-green-500/10 group-hover:text-green-500'
              }`}>
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="pt-3 border-t border-muted-foreground/10 flex items-center justify-between min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Líder</span>
              <span className="text-xs font-semibold text-green-600 dark:text-green-400 truncate max-w-[140px]" title={rankingClientes[0]?.nome}>
                {rankingClientes[0]?.nome || 'Sem dados'}
              </span>
            </div>
          </div>

          {/* Card Seletor - Produtos */}
          <div
            onClick={() => setActiveReport('produtos')}
            className={`relative overflow-hidden rounded-2xl border p-5 cursor-pointer transition-all duration-200 select-none group flex flex-col justify-between h-36 ${
              activeReport === 'produtos'
                ? 'border-purple-500 bg-purple-500/5 ring-1 ring-purple-500/20 shadow-md'
                : 'border-border/80 bg-card hover:border-muted-foreground/30 hover:bg-muted/10'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-bold text-sm leading-none text-card-foreground group-hover:text-purple-500 transition-colors">
                  Produtos (Top 10)
                </h3>
                <p className="text-xs text-muted-foreground leading-tight">
                  Produtos mais vendidos e receita gerada por item.
                </p>
              </div>
              <div className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                activeReport === 'produtos' ? 'bg-purple-500/15 text-purple-500' : 'bg-muted text-muted-foreground group-hover:bg-purple-500/10 group-hover:text-purple-500'
              }`}>
                <Package className="h-5 w-5" />
              </div>
            </div>
            <div className="pt-3 border-t border-muted-foreground/10 flex items-center justify-between min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Campeão</span>
              <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 truncate max-w-[140px]" title={rankingProdutos[0]?.nome}>
                {rankingProdutos[0]?.nome || 'Sem dados'}
              </span>
            </div>
          </div>

          {/* Card Seletor - Contas a Receber (Vencidos) */}
          <div
            onClick={() => setActiveReport('receber')}
            className={`relative overflow-hidden rounded-2xl border p-5 cursor-pointer transition-all duration-200 select-none group flex flex-col justify-between h-36 ${
              activeReport === 'receber'
                ? 'border-orange-500 bg-orange-500/5 ring-1 ring-orange-500/20 shadow-md'
                : 'border-border/80 bg-card hover:border-muted-foreground/30 hover:bg-muted/10'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-bold text-sm leading-none text-card-foreground group-hover:text-orange-500 transition-colors">
                  Contas a Receber
                </h3>
                <p className="text-xs text-muted-foreground leading-tight">
                  Clientes com parcelas em atraso (inadimplência).
                </p>
              </div>
              <div className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                activeReport === 'receber' ? 'bg-orange-500/15 text-orange-500' : 'bg-muted text-muted-foreground group-hover:bg-orange-500/10 group-hover:text-orange-500'
              }`}>
                <CalendarClock className="h-5 w-5" />
              </div>
            </div>
            <div className="pt-3 border-t border-muted-foreground/10 flex items-center justify-between min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Pendente</span>
              <span className="text-xs font-semibold text-orange-600 dark:text-orange-500 truncate font-mono">
                {formatCurrency(totalInadimplente)}
              </span>
            </div>
          </div>

          {/* Card Seletor - Saúde do Estoque */}
          <div
            onClick={() => setActiveReport('estoque_saude')}
            className={`relative overflow-hidden rounded-2xl border p-5 cursor-pointer transition-all duration-200 select-none group flex flex-col justify-between h-36 ${
              activeReport === 'estoque_saude'
                ? 'border-yellow-500 bg-yellow-500/5 ring-1 ring-yellow-500/20 shadow-md'
                : 'border-border/80 bg-card hover:border-muted-foreground/30 hover:bg-muted/10'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-bold text-sm leading-none text-card-foreground group-hover:text-yellow-600 transition-colors">
                  Saúde do Estoque
                </h3>
                <p className="text-xs text-muted-foreground leading-tight">
                  Mercadorias de baixa tiragem e produtos parados.
                </p>
              </div>
              <div className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                activeReport === 'estoque_saude' ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-500' : 'bg-muted text-muted-foreground group-hover:bg-yellow-500/10 group-hover:text-yellow-500'
              }`}>
                <Boxes className="h-5 w-5" />
              </div>
            </div>
            <div className="pt-3 border-t border-muted-foreground/10 flex items-center justify-between min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Estoque Crítico</span>
              <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-500">
                {estoqueCritico.length} item(ns)
              </span>
            </div>
          </div>

          {/* Card Seletor - Categorias */}
          <div
            onClick={() => setActiveReport('categorias')}
            className={`relative overflow-hidden rounded-2xl border p-5 cursor-pointer transition-all duration-200 select-none group flex flex-col justify-between h-36 ${
              activeReport === 'categorias'
                ? 'border-cyan-500 bg-cyan-500/5 ring-1 ring-cyan-500/20 shadow-md'
                : 'border-border/80 bg-card hover:border-muted-foreground/30 hover:bg-muted/10'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-bold text-sm leading-none text-card-foreground group-hover:text-cyan-500 transition-colors">
                  Categorias
                </h3>
                <p className="text-xs text-muted-foreground leading-tight">
                  Faturamento e saídas agregadas por categoria.
                </p>
              </div>
              <div className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                activeReport === 'categorias' ? 'bg-cyan-500/15 text-cyan-500' : 'bg-muted text-muted-foreground group-hover:bg-cyan-500/10 group-hover:text-cyan-500'
              }`}>
                <Tags className="h-5 w-5" />
              </div>
            </div>
            <div className="pt-3 border-t border-muted-foreground/10 flex items-center justify-between min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Melhor Categoria</span>
              <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 truncate max-w-[130px]" title={listaCategorias[0]?.categoria}>
                {listaCategorias[0]?.categoria || 'Sem dados'}
              </span>
            </div>
          </div>

          {/* Card Seletor - Formas de Pagamento */}
          <div
            onClick={() => setActiveReport('pagamentos')}
            className={`relative overflow-hidden rounded-2xl border p-5 cursor-pointer transition-all duration-200 select-none group flex flex-col justify-between h-36 ${
              activeReport === 'pagamentos'
                ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500/20 shadow-md'
                : 'border-border/80 bg-card hover:border-muted-foreground/30 hover:bg-muted/10'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-bold text-sm leading-none text-card-foreground group-hover:text-indigo-500 transition-colors">
                  Formas de Pagamento
                </h3>
                <p className="text-xs text-muted-foreground leading-tight">
                  Preferencia de recebimento e taxas.
                </p>
              </div>
              <div className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                activeReport === 'pagamentos' ? 'bg-indigo-500/15 text-indigo-500' : 'bg-muted text-muted-foreground group-hover:bg-indigo-500/10 group-hover:text-indigo-500'
              }`}>
                <CreditCard className="h-5 w-5" />
              </div>
            </div>
            <div className="pt-3 border-t border-muted-foreground/10 flex items-center justify-between min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Mais Usado</span>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate max-w-[130px]" title={listaPagamentos[0]?.forma}>
                {listaPagamentos[0]?.forma || 'Sem dados'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo Detalhado do Relatório Selecionado */}
      <div className="pt-2">
        {activeReport === 'fluxo' && (
          <Card className="border-border/80">
            <CardHeader className="border-b bg-muted/10 py-4 px-6">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-500" />
                Fluxo Mensal Detalhado (Últimos 6 Meses)
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Representação visual do montante faturado contra o montante recebido em cada um dos últimos seis meses.</p>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-5">
                {fluxoMensal.map((m) => {
                  const percVendido = m.vendas > 0 ? (m.vendas / maxFluxoVal) * 100 : 0
                  const percRecebido = m.entradas > 0 ? (m.entradas / maxFluxoVal) * 100 : 0
                  
                  return (
                    <div key={m.mes} className="space-y-2 p-4 rounded-xl border bg-muted/5 border-border/60">
                      <div className="flex justify-between items-center text-sm flex-wrap gap-2">
                        <span className="capitalize font-bold text-foreground">{m.mes}</span>
                        <div className="flex gap-4 text-xs font-mono font-semibold">
                          <span className="text-blue-600 dark:text-blue-400">Vendido: {formatCurrency(m.vendas)}</span>
                          <span className="text-green-600 dark:text-green-400">Recebido: {formatCurrency(m.entradas)}</span>
                        </div>
                      </div>
                      <div className="space-y-2 pt-1">
                        {/* Faturado (Vendido) */}
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-muted-foreground w-14 shrink-0 font-semibold uppercase tracking-wider">Vendido</span>
                          <div className="flex-1 h-2 bg-muted/80 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-500"
                              style={{ width: `${percVendido}%` }}
                            />
                          </div>
                        </div>
                        {/* Efetivamente Recebido */}
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-muted-foreground w-14 shrink-0 font-semibold uppercase tracking-wider">Recebido</span>
                          <div className="flex-1 h-2 bg-muted/80 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full transition-all duration-500"
                              style={{ width: `${percRecebido}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Percentual de Recebimento do mês */}
                      <div className="text-[10px] text-muted-foreground/80 flex justify-between items-center pt-1 border-t border-muted/30">
                        <span>Aproveitamento de Recebimento no Mês:</span>
                        <span className="font-bold text-foreground font-mono">
                          {m.vendas > 0 ? ((m.entradas / m.vendas) * 100).toFixed(0) : '0'}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {activeReport === 'clientes' && (
          <Card className="border-border/80">
            <CardHeader className="border-b bg-muted/10 py-4 px-6">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                Ranking de Clientes (Top 10)
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Clientes líderes em volume de compra e faturamento total gerado no período de data ativo.</p>
            </CardHeader>
            <CardContent className="p-6">
              {rankingClientes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground space-y-2">
                  <Users className="h-10 w-10 mx-auto opacity-20" />
                  <p className="text-sm">Nenhum faturamento de cliente registrado no período selecionado.</p>
                </div>
              ) : (
                <div className="divide-y border border-border/80 rounded-xl overflow-hidden bg-card">
                  {rankingClientes.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm p-4 hover:bg-muted/5 transition-colors">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-black ${
                          i === 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                          i === 1 ? 'bg-slate-400/15 text-slate-600 dark:text-slate-400' :
                          i === 2 ? 'bg-amber-700/15 text-amber-700 dark:text-amber-500' : 'bg-muted text-muted-foreground'
                        }`}>
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate max-w-[180px] sm:max-w-xs" title={c.nome}>{c.nome}</p>
                          <p className="text-xs text-muted-foreground font-mono">{c.vendas} compra(s) realizada(s)</p>
                        </div>
                      </div>
                      <p className="font-bold text-green-600 dark:text-green-400 font-mono text-right pl-3 shrink-0">{formatCurrency(c.total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeReport === 'produtos' && (
          <Card className="border-border/80">
            <CardHeader className="border-b bg-muted/10 py-4 px-6">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-500" />
                Ranking de Produtos (Top 10)
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Produtos líderes em quantidade de peças vendidas e receita bruta total gerada no período de data ativo.</p>
            </CardHeader>
            <CardContent className="p-6">
              {rankingProdutos.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground space-y-2">
                  <Package className="h-10 w-10 mx-auto opacity-20" />
                  <p className="text-sm">Nenhuma venda de produto registrada no período selecionado.</p>
                </div>
              ) : (
                <div className="divide-y border border-border/80 rounded-xl overflow-hidden bg-card">
                  {rankingProdutos.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm p-4 hover:bg-muted/5 transition-colors">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-black ${
                          i === 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                          i === 1 ? 'bg-slate-400/15 text-slate-600 dark:text-slate-400' :
                          i === 2 ? 'bg-amber-700/15 text-amber-700 dark:text-amber-500' : 'bg-muted text-muted-foreground'
                        }`}>
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate max-w-[180px] sm:max-w-xs" title={p.nome}>{p.nome}</p>
                          <p className="text-xs text-muted-foreground font-mono">{p.quantidade} peça(s) vendida(s)</p>
                        </div>
                      </div>
                      <p className="font-bold text-foreground font-mono text-right pl-3 shrink-0">{formatCurrency(p.receita)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 1. Contas a Receber (Vencidos) */}
        {activeReport === 'receber' && (
          <Card className="border-border/80">
            <CardHeader className="border-b bg-muted/10 py-4 px-6">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-orange-500" />
                Contas a Receber (Vencidos)
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Lista de clientes com parcelas vencidas e em aberto. Total pendente atrasado: <strong className="text-destructive font-mono">{formatCurrency(totalInadimplente)}</strong></p>
            </CardHeader>
            <CardContent className="p-6">
              {listaInadimplencia.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground space-y-2">
                  <CalendarClock className="h-10 w-10 mx-auto opacity-20" />
                  <p className="text-sm">Nenhuma parcela vencida em atraso!</p>
                </div>
              ) : (
                <div className="divide-y border border-border/80 rounded-xl overflow-hidden bg-card">
                  {listaInadimplencia.map((c, i) => {
                    const template = config?.templateInadimplente || config?.templateCobranca || "Olá, [nome]! Lembramos que há um valor pendente de [valor] em aberto. Por favor, entre em contato para regularizar."
                    let cleanPhone = c.telefone.replace(/\D/g, '')
                    if (cleanPhone.length > 0 && !cleanPhone.startsWith('55') && cleanPhone.length <= 11) {
                      cleanPhone = '55' + cleanPhone
                    }
                    const mensagem = template
                      .replace(/\[nome\]/gi, c.clienteNome)
                      .replace(/\[valor\]/gi, formatCurrency(c.valorPendente))
                    const linkWpp = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(mensagem)}`
                    
                    return (
                      <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm p-4 hover:bg-muted/5 transition-colors gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="flex items-center justify-center h-6.5 w-6.5 rounded-full text-xs font-black bg-destructive/10 text-destructive shrink-0">
                            !
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate max-w-[180px] sm:max-w-xs">{c.clienteNome}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.parcelasAtrasadas} parcela(s) · Atrasado desde: <span className="font-semibold font-mono">{formatDate(c.dataMaisAntiga)}</span>
                            </p>
                            {c.cidade && <p className="text-[10px] text-muted-foreground/80">{c.cidade}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 justify-between sm:justify-end shrink-0">
                          <div className="text-right">
                            <p className="font-bold text-destructive font-mono">{formatCurrency(c.valorPendente)}</p>
                            <p className="text-[10px] text-muted-foreground">{c.telefone || 'Sem telefone'}</p>
                          </div>
                          {c.telefone && (
                            <a
                              href={linkWpp}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center h-9 px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold gap-1.5 transition-colors shadow-sm"
                            >
                              <MessageSquare className="h-4 w-4 shrink-0" />
                              Cobrar
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 2. Saúde do Estoque */}
        {activeReport === 'estoque_saude' && (
          <Card className="border-border/80">
            <CardHeader className="border-b bg-muted/10 py-4 px-6">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Boxes className="h-5 w-5 text-amber-500" />
                Saúde do Estoque
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Identifique gargalos de reposição (estoque baixo) e mercadorias sem saída (capital parado).</p>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Reposição Urgente */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-destructive flex items-center gap-1.5 uppercase tracking-wider">
                    <AlertCircle className="h-4.5 w-4.5" />
                    Reposição Urgente ({estoqueCritico.length})
                  </h3>
                  {estoqueCritico.length === 0 ? (
                    <div className="border rounded-xl p-6 text-center text-xs text-muted-foreground">
                      Todos os produtos estão com estoque saudável!
                    </div>
                  ) : (
                    <div className="divide-y border rounded-xl overflow-hidden bg-card max-h-[360px] overflow-y-auto">
                      {estoqueCritico.map((p) => (
                        <div key={p.id} className="flex justify-between items-center p-3 text-xs hover:bg-muted/5">
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate max-w-[160px] sm:max-w-xs">{p.nome}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">Ref: {p.codigo} · {p.categoria}</p>
                          </div>
                          <span className={`px-2 py-0.5 font-bold rounded-full font-mono text-[10px] ${
                            p.totalEstoque === 0 ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}>
                            {p.totalEstoque} un.
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Estoque Sem Giro */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <Boxes className="h-4.5 w-4.5" />
                    Sem Saída no Período ({produtosSemGiro.length})
                  </h3>
                  {produtosSemGiro.length === 0 ? (
                    <div className="border rounded-xl p-6 text-center text-xs text-muted-foreground">
                      Todos os produtos tiveram pelo menos 1 venda registrada!
                    </div>
                  ) : (
                    <div className="divide-y border rounded-xl overflow-hidden bg-card max-h-[360px] overflow-y-auto">
                      {produtosSemGiro.map((p) => {
                        const capitalParado = p.precoCusto * p.totalEstoque
                        return (
                          <div key={p.id} className="flex justify-between items-center p-3 text-xs hover:bg-muted/5">
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate max-w-[160px] sm:max-w-xs">{p.nome}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">Estoque: {p.totalEstoque} un. · Unitário: {formatCurrency(p.precoCusto)}</p>
                            </div>
                            <span className="font-bold text-muted-foreground font-mono whitespace-nowrap pl-2 text-right">
                              {formatCurrency(capitalParado)} <span className="text-[9px] text-muted-foreground/60 font-normal">parado</span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 3. Vendas por Categoria */}
        {activeReport === 'categorias' && (
          <Card className="border-border/80">
            <CardHeader className="border-b bg-muted/10 py-4 px-6">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Tags className="h-5 w-5 text-cyan-500" />
                Vendas por Categoria
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Faturamento consolidado e volume de itens vendidos agrupados por categoria.</p>
            </CardHeader>
            <CardContent className="p-6">
              {listaCategorias.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground space-y-2">
                  <Tags className="h-10 w-10 mx-auto opacity-20" />
                  <p className="text-sm">Sem vendas registradas no período.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {listaCategorias.map((c) => {
                    const percentTotal = totalVendasPeriodo > 0 ? (c.total / totalVendasPeriodo) * 100 : 0
                    const percBar = (c.total / maxCategoriaVal) * 100
                    return (
                      <div key={c.categoria} className="space-y-2 p-3.5 rounded-xl border bg-muted/5 border-border/60">
                        <div className="flex justify-between items-center text-sm flex-wrap gap-2">
                          <span className="font-bold text-foreground capitalize">{c.categoria}</span>
                          <div className="flex gap-4 text-xs font-mono font-semibold">
                            <span className="text-muted-foreground">{c.quantidade} peças</span>
                            <span className="text-cyan-600 dark:text-cyan-400">{formatCurrency(c.total)} ({percentTotal.toFixed(1)}%)</span>
                          </div>
                        </div>
                        <div className="h-2.5 bg-muted/80 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                            style={{ width: `${percBar}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 4. Formas de Pagamento */}
        {activeReport === 'pagamentos' && (
          <Card className="border-border/80">
            <CardHeader className="border-b bg-muted/10 py-4 px-6">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-indigo-500" />
                Métodos de Pagamento Utilizados
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Distribuição do faturamento bruto conforme a forma de pagamento selecionada na venda.</p>
            </CardHeader>
            <CardContent className="p-6">
              {listaPagamentos.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground space-y-2">
                  <CreditCard className="h-10 w-10 mx-auto opacity-20" />
                  <p className="text-sm">Sem dados de pagamento no período.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {listaPagamentos.map((p) => {
                    const percentTotal = totalVendasPeriodo > 0 ? (p.total / totalVendasPeriodo) * 100 : 0
                    const percBar = (p.total / maxPagamentoVal) * 100
                    return (
                      <div key={p.forma} className="space-y-2 p-3.5 rounded-xl border bg-muted/5 border-border/60">
                        <div className="flex justify-between items-center text-sm flex-wrap gap-2">
                          <span className="font-bold text-foreground">{p.forma}</span>
                          <div className="flex gap-4 text-xs font-mono font-semibold">
                            <span className="text-muted-foreground">{p.vendas} transações</span>
                            <span className="text-indigo-600 dark:text-indigo-400">{formatCurrency(p.total)} ({percentTotal.toFixed(1)}%)</span>
                          </div>
                        </div>
                        <div className="h-2.5 bg-muted/80 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${percBar}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
