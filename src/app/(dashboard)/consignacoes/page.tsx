'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchConsignacoes, fetchAcertosByConsignacao, registrarAcerto } from '@/lib/database'
import type { Consignacao, FormaPagamentoRecebimento } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Handshake, Loader2, PackageCheck, History, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

type MovState = Record<string, { vendidas: number; devolvidas: number }>

const FP_RECEBIMENTO: { value: FormaPagamentoRecebimento; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao', label: 'Cartão' },
]

const itemKey = (produtoId: string, tamanho: string) => `${produtoId}__${tamanho}`

export default function ConsignacoesPage() {
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState<'abertas' | 'todas'>('abertas')
  const [acertoConsig, setAcertoConsig] = useState<Consignacao | null>(null)
  const [mov, setMov] = useState<MovState>({})
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoRecebimento>('dinheiro')
  const [observacoes, setObservacoes] = useState('')
  const [saving, setSaving] = useState(false)
  const [historicoConsig, setHistoricoConsig] = useState<Consignacao | null>(null)

  const { data: consignacoes = [], isLoading } = useQuery({ queryKey: ['consignacoes'], queryFn: fetchConsignacoes })

  const lista = consignacoes.filter((c) => filtro === 'todas' || c.status === 'aberta')

  function abrirAcerto(c: Consignacao) {
    const inicial: MovState = {}
    c.itens.forEach((i) => { inicial[itemKey(i.produtoId, i.tamanho)] = { vendidas: 0, devolvidas: 0 } })
    setMov(inicial)
    setFormaPagamento('dinheiro')
    setObservacoes('')
    setAcertoConsig(c)
  }

  function setMovValue(key: string, campo: 'vendidas' | 'devolvidas', valor: number, pendente: number) {
    setMov((prev) => {
      const atual = prev[key] ?? { vendidas: 0, devolvidas: 0 }
      const next = { ...atual, [campo]: Math.max(0, Math.floor(valor || 0)) }
      // Não deixa vendidas + devolvidas passar do pendente
      if (next.vendidas + next.devolvidas > pendente) {
        const outro = campo === 'vendidas' ? next.devolvidas : next.vendidas
        next[campo] = Math.max(0, pendente - outro)
      }
      return { ...prev, [key]: next }
    })
  }

  const valorAcerto = useMemo(() => {
    if (!acertoConsig) return 0
    return acertoConsig.itens.reduce((s, i) => {
      const m = mov[itemKey(i.produtoId, i.tamanho)]
      return s + (m ? m.vendidas * i.precoUnitario : 0)
    }, 0)
  }, [acertoConsig, mov])

  function devolverRestante() {
    if (!acertoConsig) return
    const novo: MovState = {}
    acertoConsig.itens.forEach((i) => {
      const pendente = i.quantidade - i.vendidas - i.devolvidas
      novo[itemKey(i.produtoId, i.tamanho)] = { vendidas: 0, devolvidas: Math.max(0, pendente) }
    })
    setMov(novo)
  }

  async function confirmarAcerto() {
    if (!acertoConsig) return
    const itens = acertoConsig.itens
      .map((i) => {
        const m = mov[itemKey(i.produtoId, i.tamanho)] ?? { vendidas: 0, devolvidas: 0 }
        return { produtoId: i.produtoId, produtoNome: i.produtoNome, tamanho: i.tamanho, vendidas: m.vendidas, devolvidas: m.devolvidas }
      })
      .filter((i) => i.vendidas > 0 || i.devolvidas > 0)

    if (itens.length === 0) { toast.error('Informe ao menos uma peça vendida ou devolvida'); return }

    setSaving(true)
    try {
      await registrarAcerto({ consignacao: acertoConsig, itens, formaPagamento, observacoes })
      qc.invalidateQueries({ queryKey: ['consignacoes'] })
      qc.invalidateQueries({ queryKey: ['produtos'] })
      qc.invalidateQueries({ queryKey: ['relatorios'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Acerto registrado!')
      setAcertoConsig(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar acerto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Handshake className="h-5 w-5" />Consignações</h1>
          <p className="text-sm text-muted-foreground">Peças entregues a lojistas · acerto de contas e devoluções</p>
        </div>
        <Select value={filtro} onValueChange={(v) => setFiltro(v as 'abertas' | 'todas')}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="abertas">Em aberto</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : lista.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Handshake className="h-12 w-12 mx-auto mb-3 opacity-20" />
          Nenhuma consignação {filtro === 'abertas' ? 'em aberto' : 'registrada'}.
          <p className="text-xs mt-1">Crie uma no PDV escolhendo a forma de pagamento &quot;Consignado&quot;.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {lista.map((c) => {
            const totalEntregues = c.itens.reduce((s, i) => s + i.quantidade, 0)
            const totalVendidas = c.itens.reduce((s, i) => s + i.vendidas, 0)
            const totalDevolvidas = c.itens.reduce((s, i) => s + i.devolvidas, 0)
            const totalPendente = totalEntregues - totalVendidas - totalDevolvidas
            const perc = totalEntregues > 0 ? ((totalVendidas + totalDevolvidas) / totalEntregues) * 100 : 0
            return (
              <Card key={c.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{c.clienteNome}</p>
                      <p className="text-xs text-muted-foreground">{c.clienteCidade || '—'} · Entrega {formatDate(new Date(c.dataEntrega))}</p>
                    </div>
                    <Badge variant={c.status === 'aberta' ? 'default' : c.status === 'fechada' ? 'secondary' : 'destructive'} className="capitalize shrink-0">
                      {c.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-lg border bg-muted/20 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Entregues</p>
                      <p className="text-sm font-bold font-mono">{totalEntregues}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Vendidas</p>
                      <p className="text-sm font-bold font-mono text-green-600 dark:text-green-400">{totalVendidas}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Devolv.</p>
                      <p className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400">{totalDevolvidas}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">Pendente</p>
                      <p className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">{totalPendente}</p>
                    </div>
                  </div>

                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${perc}%` }} />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Recebido: <strong className="text-green-600 dark:text-green-400 font-mono">{formatCurrency(c.totalRecebido)}</strong></span>
                    <span className="text-muted-foreground">Potencial: <strong className="text-foreground font-mono">{formatCurrency(c.totalEntregue)}</strong></span>
                  </div>

                  <div className="flex gap-2 pt-1">
                    {c.status === 'aberta' && (
                      <Button size="sm" className="flex-1" onClick={() => abrirAcerto(c)}>
                        <PackageCheck className="mr-1.5 h-4 w-4" />Acertar contas
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className={c.status === 'aberta' ? '' : 'flex-1'} onClick={() => setHistoricoConsig(c)}>
                      <History className="mr-1.5 h-4 w-4" />Histórico
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog de Acerto */}
      <Dialog open={!!acertoConsig} onOpenChange={(v) => { if (!v) setAcertoConsig(null) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Acerto de contas — {acertoConsig?.clienteNome}</DialogTitle></DialogHeader>
          {acertoConsig && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Informe quantas peças o lojista <strong>vendeu</strong> (você recebe) e quantas <strong>devolveu</strong> (voltam ao estoque). O restante segue pendente para o próximo acerto.
              </p>

              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={devolverRestante}>
                  <Undo2 className="mr-1.5 h-3.5 w-3.5" />Devolver todo o restante
                </Button>
              </div>

              <div className="space-y-2">
                {acertoConsig.itens.map((i) => {
                  const pendente = i.quantidade - i.vendidas - i.devolvidas
                  const key = itemKey(i.produtoId, i.tamanho)
                  const m = mov[key] ?? { vendidas: 0, devolvidas: 0 }
                  if (pendente <= 0) return null
                  return (
                    <div key={key} className="rounded-xl border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{i.produtoNome} <span className="text-muted-foreground">({i.tamanho})</span></p>
                        <span className="text-[11px] text-muted-foreground shrink-0">pend. {pendente} · {formatCurrency(i.precoUnitario)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-green-600 dark:text-green-400">Vendidas</Label>
                          <Input type="number" min="0" max={pendente} value={m.vendidas} onFocus={(e) => e.target.select()}
                            onChange={(e) => setMovValue(key, 'vendidas', Number(e.target.value), pendente)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-blue-600 dark:text-blue-400">Devolvidas</Label>
                          <Input type="number" min="0" max={pendente} value={m.devolvidas} onFocus={(e) => e.target.select()}
                            onChange={(e) => setMovValue(key, 'devolvidas', Number(e.target.value), pendente)} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Forma de recebimento</Label>
                  <Select value={formaPagamento} onValueChange={(v) => setFormaPagamento(v as FormaPagamentoRecebimento)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FP_RECEBIMENTO.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor a receber</Label>
                  <div className="h-9 flex items-center px-3 rounded-md border bg-muted/30 font-mono font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(valorAcerto)}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Observações</Label>
                <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Opcional" />
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setAcertoConsig(null)}>Cancelar</Button>
                <Button onClick={confirmarAcerto} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar acerto</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Histórico */}
      <HistoricoDialog consignacao={historicoConsig} onClose={() => setHistoricoConsig(null)} />
    </div>
  )
}

function HistoricoDialog({ consignacao, onClose }: { consignacao: Consignacao | null; onClose: () => void }) {
  const { data: acertos = [], isLoading } = useQuery({
    queryKey: ['acertos', consignacao?.id],
    queryFn: () => consignacao ? fetchAcertosByConsignacao(consignacao.id) : Promise.resolve([]),
    enabled: !!consignacao?.id,
  })

  return (
    <Dialog open={!!consignacao} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Histórico — {consignacao?.clienteNome}</DialogTitle></DialogHeader>
        {consignacao && (
          <div className="space-y-4">
            <div className="rounded-xl border p-3 space-y-1 text-xs">
              <p className="font-semibold text-sm">Itens entregues</p>
              {consignacao.itens.map((i) => (
                <div key={itemKey(i.produtoId, i.tamanho)} className="flex justify-between text-muted-foreground">
                  <span>{i.produtoNome} ({i.tamanho}) · {formatCurrency(i.precoUnitario)}</span>
                  <span className="font-mono">{i.quantidade} entregues · {i.vendidas} vend. · {i.devolvidas} dev.</span>
                </div>
              ))}
            </div>

            <div>
              <p className="font-semibold text-sm mb-2">Acertos</p>
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
              ) : acertos.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhum acerto registrado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {acertos.map((a) => (
                    <div key={a.id} className="rounded-lg border p-3 text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{formatDate(new Date(a.dataAcerto))} · <span className="capitalize">{a.formaPagamento}</span></span>
                        <span className="font-mono font-bold text-green-600 dark:text-green-400">{formatCurrency(a.valorRecebido)}</span>
                      </div>
                      {a.itens.map((it, idx) => (
                        <div key={idx} className="flex justify-between text-muted-foreground">
                          <span>{it.produtoNome} ({it.tamanho})</span>
                          <span className="font-mono">{it.vendidas} vend. · {it.devolvidas} dev.</span>
                        </div>
                      ))}
                      {a.observacoes && <p className="text-muted-foreground/80 italic pt-1">{a.observacoes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
