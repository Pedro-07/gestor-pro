'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { fetchVendas } from '@/lib/database'
import type { Venda } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Search, Eye, ShoppingCart } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const statusMap: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  paga: { label: 'Paga', variant: 'default' },
  pendente: { label: 'Pendente', variant: 'secondary' },
  parcialmente_paga: { label: 'Parcial', variant: 'outline' },
  atrasada: { label: 'Atrasada', variant: 'destructive' },
  cancelada: { label: 'Cancelada', variant: 'outline' },
}

const fpLabel: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', cartao: 'Cartão', promissoria: 'Promissória',
}

export default function VendasPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todas')

  const { data: vendas = [], isLoading } = useQuery({ queryKey: ['vendas'], queryFn: fetchVendas })

  const filtered = vendas.filter((v) => {
    const matchSearch = v.clienteNome.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'todas' || v.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos os status</SelectItem>
            <SelectItem value="paga">Paga</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="parcialmente_paga">Parcialmente Paga</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => router.push('/vendas/pdv')} className="shrink-0"><Plus className="h-4 w-4 mr-2" />Nova Venda</Button>
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length} venda(s) encontrada(s)</p>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma venda encontrada.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const s = statusMap[v.status] ?? { label: v.status, variant: 'secondary' }
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
                        {formatDate(new Date(v.createdAt))} · {v.itens.length} item(s) · {fpLabel[v.formaPagamento] ?? v.formaPagamento}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="font-bold">{formatCurrency(v.total)}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Eye className="h-4 w-4" />
                          </Button>
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
      )}
    </div>
  )
}
