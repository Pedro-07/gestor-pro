'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { fetchVendas } from '@/lib/database'
import { formatCurrency } from '@/lib/utils'
import { format, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Plus, Eye, ShoppingCart, SlidersHorizontal, CalendarDays } from 'lucide-react'

const statusMap: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  paga: { label: 'Paga', variant: 'default' },
  pendente: { label: 'Pendente', variant: 'secondary' },
  parcialmente_paga: { label: 'Parcial', variant: 'outline' },
  atrasada: { label: 'Atrasada', variant: 'destructive' },
  cancelada: { label: 'Cancelada', variant: 'outline' },
}
const fpLabel: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', cartao: 'Cartão', promissoria: 'Promissória', consignado: 'Consignado',
}

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')
const hoje = dayKey(new Date())

function labelDia(key: string) {
  const d = new Date(key + 'T12:00:00')
  if (isToday(d)) return 'Hoje'
  if (isYesterday(d)) return 'Ontem'
  return format(d, "EEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
}

export default function MinhasVendasPage() {
  const router = useRouter()
  const [dataInicio, setDataInicio] = useState(hoje)
  const [dataFim, setDataFim] = useState(hoje)
  const [cliente, setCliente] = useState('')
  const [vendaId, setVendaId] = useState('')

  const { data: vendas = [], isLoading } = useQuery({ queryKey: ['vendas'], queryFn: fetchVendas })

  const periodoHoje = dataInicio === hoje && dataFim === hoje
  const temFiltroExtra = cliente.trim() !== '' || vendaId.trim() !== '' || !periodoHoje

  const filtered = vendas.filter((v) => {
    const k = dayKey(new Date(v.createdAt))
    if (dataInicio && k < dataInicio) return false
    if (dataFim && k > dataFim) return false
    if (cliente.trim() && !v.clienteNome.toLowerCase().includes(cliente.trim().toLowerCase())) return false
    if (vendaId.trim() && !v.id.toLowerCase().includes(vendaId.trim().toLowerCase())) return false
    return true
  })

  // Agrupa por dia (mais recente primeiro)
  const grupos: Record<string, typeof filtered> = {}
  filtered.forEach((v) => { const k = dayKey(new Date(v.createdAt)); (grupos[k] ??= []).push(v) })
  const dias = Object.keys(grupos).sort().reverse()
  dias.forEach((k) => grupos[k].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))

  function limpar() { setDataInicio(hoje); setDataFim(hoje); setCliente(''); setVendaId('') }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Minhas Vendas</h1>
          <p className="text-sm text-muted-foreground">
            {periodoHoje && !cliente && !vendaId ? 'Vendas de hoje' : 'Resultado do filtro'} · {filtered.length} venda(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors hover:bg-muted" title="Filtrar">
              <SlidersHorizontal className="h-4 w-4" />
              {temFiltroExtra && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <p className="text-sm font-semibold">Filtrar vendas</p>
              <div className="space-y-1">
                <Label className="text-xs">Período</Label>
                <div className="flex items-center gap-2">
                  <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="flex-1 h-9" title="De" />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="flex-1 h-9" title="Até" />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => { setDataInicio(hoje); setDataFim(hoje) }}>Hoje</Button>
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => { setDataInicio(''); setDataFim('') }}>Todas as datas</Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cliente</Label>
                <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ID da venda</Label>
                <Input value={vendaId} onChange={(e) => setVendaId(e.target.value)} placeholder="Cole o ID da venda" className="h-9" />
              </div>
              <Button type="button" variant="ghost" size="sm" className="w-full" onClick={limpar}>Limpar (voltar para hoje)</Button>
            </PopoverContent>
          </Popover>
          <Button onClick={() => router.push('/vendas/pdv')} className="shrink-0"><Plus className="h-4 w-4 mr-2" />Nova Venda</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-20" />
          {periodoHoje && !cliente && !vendaId ? 'Nenhuma venda hoje ainda.' : 'Nenhuma venda encontrada para o filtro.'}
        </CardContent></Card>
      ) : (
        <div className="space-y-5">
          {dias.map((dia) => {
            const doDia = grupos[dia]
            const totalDia = doDia.filter((v) => v.status !== 'cancelada').reduce((s, v) => s + v.total, 0)
            return (
              <div key={dia} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-bold capitalize">{labelDia(dia)}</h2>
                  <span className="text-xs text-muted-foreground">{doDia.length} venda(s) · <strong className="text-foreground font-mono">{formatCurrency(totalDia)}</strong></span>
                </div>
                <div className="space-y-2">
                  {doDia.map((v) => {
                    const s = statusMap[v.status] ?? { label: v.status, variant: 'secondary' as const }
                    return (
                      <Card key={v.id} className="hover:shadow-sm transition-shadow">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-primary/10 p-2 rounded-full hidden sm:block">
                              <ShoppingCart className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium truncate">{v.clienteNome}</p>
                                <Badge variant={s.variant} className="text-xs shrink-0">{s.label}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground truncate">
                                {format(new Date(v.createdAt), 'HH:mm')} · {v.itens.length} item(s) · {fpLabel[v.formaPagamento] ?? v.formaPagamento}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right hidden sm:block"><p className="font-bold">{formatCurrency(v.total)}</p></div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => router.push(`/vendas/${v.id}`)}>
                                    <Eye className="mr-2 h-4 w-4" />Ver Detalhes
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
