'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchVendas, fetchAcertos } from '@/lib/database'
import { formatCurrency, formatDate } from '@/lib/utils'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, ShoppingCart, Handshake } from 'lucide-react'

type Periodo = 'mes_atual' | 'mes_passado' | 'semana' | 'ano' | 'tudo'

const fpLabel: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', cartao: 'Cartão', promissoria: 'Promissória', consignado: 'Consignado',
}

interface Transacao {
  id: string
  date: Date
  cliente: string
  tipo: 'Venda' | 'Consignação'
  forma: string
  valor: number
  cancelada?: boolean
}

function getInterval(p: Periodo) {
  const now = new Date()
  switch (p) {
    case 'mes_atual': return { start: startOfMonth(now), end: endOfMonth(now) }
    case 'mes_passado': { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { start: startOfMonth(lm), end: endOfMonth(lm) } }
    case 'semana': return { start: startOfWeek(now, { locale: ptBR }), end: endOfWeek(now, { locale: ptBR }) }
    case 'ano': return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31, 23, 59, 59) }
    case 'tudo': return null
  }
}

export function TransacoesPanel() {
  const [periodo, setPeriodo] = useState<Periodo>('mes_atual')
  const [forma, setForma] = useState('todas')
  const [cliente, setCliente] = useState('')

  const { data: vendas = [], isLoading: l1 } = useQuery({ queryKey: ['vendas'], queryFn: fetchVendas })
  const { data: acertos = [], isLoading: l2 } = useQuery({ queryKey: ['acertos'], queryFn: fetchAcertos })
  const isLoading = l1 || l2

  const transacoes: Transacao[] = [
    ...vendas.map((v) => ({
      id: v.id, date: new Date(v.createdAt), cliente: v.clienteNome,
      tipo: 'Venda' as const, forma: v.formaPagamento, valor: v.total, cancelada: v.status === 'cancelada',
    })),
    ...acertos.map((a) => ({
      id: a.id, date: new Date(a.dataAcerto), cliente: a.clienteNome,
      tipo: 'Consignação' as const, forma: a.formaPagamento, valor: a.valorRecebido ?? 0,
    })),
  ]

  const intervalo = getInterval(periodo)
  const filtradas = transacoes.filter((t) => {
    if (intervalo && !isWithinInterval(t.date, intervalo)) return false
    if (forma !== 'todas' && t.forma !== forma) return false
    if (cliente.trim() && !t.cliente.toLowerCase().includes(cliente.trim().toLowerCase())) return false
    return true
  }).sort((a, b) => b.date.getTime() - a.date.getTime())

  const totalPeriodo = filtradas.filter((t) => !t.cancelada).reduce((s, t) => s + t.valor, 0)

  // Breakdown por forma de pagamento (ignora canceladas)
  const porForma: Record<string, number> = {}
  filtradas.filter((t) => !t.cancelada).forEach((t) => { porForma[t.forma] = (porForma[t.forma] ?? 0) + t.valor })
  const formasOrdenadas = Object.entries(porForma).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mes_atual">Mês atual</SelectItem>
            <SelectItem value="mes_passado">Mês passado</SelectItem>
            <SelectItem value="semana">Esta semana</SelectItem>
            <SelectItem value="ano">Este ano</SelectItem>
            <SelectItem value="tudo">Tudo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={forma} onValueChange={setForma}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Forma" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as formas</SelectItem>
            <SelectItem value="dinheiro">Dinheiro</SelectItem>
            <SelectItem value="pix">PIX</SelectItem>
            <SelectItem value="cartao">Cartão</SelectItem>
            <SelectItem value="promissoria">Promissória</SelectItem>
            <SelectItem value="consignado">Consignado</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente..." className="pl-9" value={cliente} onChange={(e) => setCliente(e.target.value)} />
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Transações</p><p className="text-xl font-bold">{filtradas.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Total no período</p><p className="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalPeriodo)}</p></CardContent></Card>
      </div>

      {formasOrdenadas.length > 0 && (
        <div className="rounded-xl border p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Por forma de pagamento</p>
          <div className="flex flex-wrap gap-2">
            {formasOrdenadas.map(([f, v]) => (
              <span key={f} className="inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1 text-xs">
                <span className="font-medium">{fpLabel[f] ?? f}</span>
                <span className="font-mono font-semibold">{formatCurrency(v)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : filtradas.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma transação no período/filtro.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtradas.map((t) => (
            <Card key={`${t.tipo}-${t.id}`} className={t.cancelada ? 'opacity-60' : ''}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <div className={`p-2 rounded-full hidden sm:block ${t.tipo === 'Venda' ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                  {t.tipo === 'Venda' ? <ShoppingCart className="h-5 w-5" /> : <Handshake className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{t.cliente}</p>
                    <Badge variant={t.tipo === 'Venda' ? 'secondary' : 'outline'} className="text-[10px]">{t.tipo}</Badge>
                    {t.cancelada && <Badge variant="outline" className="text-[10px]">Cancelada</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{formatDate(t.date)} · {fpLabel[t.forma] ?? t.forma}</p>
                </div>
                <p className={`font-bold shrink-0 ${t.cancelada ? 'line-through text-muted-foreground' : ''}`}>{formatCurrency(t.valor)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
