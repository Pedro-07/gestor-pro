'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPedidos, fetchClientes, executarVenda, insertClienteRetornando, marcarPedidoFinalizado, cancelarPedido } from '@/lib/database'
import type { Pedido, PedidoStatus, Cliente, FormaPagamento, ItemVenda } from '@/types'
import { useAppConfig } from '@/hooks/useAppConfig'
import { formatCurrency, formatDate, formatPhone, buildWhatsAppUrl, generateClientCode } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Combobox } from '@/components/shared/combobox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ClipboardList, MoreVertical, MessageCircle, CheckCircle2, XCircle, Loader2, Package, Share2, Copy, Check, Store } from 'lucide-react'
import { toast } from 'sonner'

const FP_OPTIONS: { value: FormaPagamento; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'promissoria', label: 'Nota Promissória' },
]

const statusConfig: Record<PedidoStatus, { label: string; variant: 'default' | 'destructive' | 'secondary' }> = {
  novo: { label: 'Novo', variant: 'default' },
  finalizado: { label: 'Finalizado', variant: 'secondary' },
  cancelado: { label: 'Cancelado', variant: 'destructive' },
}

export default function PedidosPage() {
  const qc = useQueryClient()
  const { meiosPagamento, slug, catalogoAtivo, nomeApp } = useAppConfig()
  const [origin, setOrigin] = useState('')
  const [copiado, setCopiado] = useState(false)
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const linkCatalogo = origin && slug ? `${origin}/loja/${slug}` : ''

  const [statusFilter, setStatusFilter] = useState<'novos' | 'todos'>('novos')
  const [finalizando, setFinalizando] = useState<Pedido | null>(null)
  const [cancelando, setCancelando] = useState<Pedido | null>(null)
  const [saving, setSaving] = useState(false)

  // Estado do dialog de finalização
  const [modoCliente, setModoCliente] = useState<'novo' | 'existente'>('novo')
  const [clienteExistenteId, setClienteExistenteId] = useState('')
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('dinheiro')
  const [entrada, setEntrada] = useState(0)
  const [numeroParcelas, setNumeroParcelas] = useState(2)

  const { data: pedidos = [], isLoading } = useQuery({ queryKey: ['pedidos'], queryFn: fetchPedidos })
  const { data: clientes = [] } = useQuery<Cliente[]>({ queryKey: ['clientes'], queryFn: fetchClientes })

  const fpOptions = FP_OPTIONS.filter((fp) => meiosPagamento[fp.value]?.ativo !== false)
  const lista = pedidos.filter((p) => statusFilter === 'todos' || p.status === 'novo')

  function abrirFinalizar(p: Pedido) {
    setFinalizando(p)
    setModoCliente('novo')
    setClienteExistenteId('')
    setFormaPagamento('dinheiro')
    setEntrada(0)
    setNumeroParcelas(2)
  }

  async function finalizar() {
    if (!finalizando) return
    if (modoCliente === 'existente' && !clienteExistenteId) { toast.error('Selecione o cliente'); return }
    const pedido = finalizando
    setSaving(true)
    try {
      // 1) Resolver o cliente (criar novo com os dados do pedido, ou vincular a existente)
      let clienteId: string, clienteNome: string, clienteCidade: string, clienteTelefone: string
      if (modoCliente === 'existente') {
        const c = clientes.find((x) => x.id === clienteExistenteId)!
        clienteId = c.id; clienteNome = c.nome; clienteCidade = c.cidade; clienteTelefone = c.telefone ?? ''
      } else {
        const codigo = generateClientCode(clientes.map((c) => c.codigo ?? ''))
        const novo = await insertClienteRetornando({
          codigo,
          nome: pedido.clienteNome,
          cpfCnpj: pedido.clienteCpfCnpj || '',
          telefone: pedido.clienteTelefone || '',
          cidade: pedido.clienteCidade || '',
          endereco: pedido.clienteEndereco || '',
          observacoes: pedido.clienteObservacoes || undefined,
          status: 'ativo',
        })
        clienteId = novo.id; clienteNome = novo.nome; clienteCidade = novo.cidade; clienteTelefone = novo.telefone ?? ''
      }

      // 2) Itens da venda (o pedido já traz preço/subtotal calculados no servidor)
      const itens: ItemVenda[] = pedido.itens.map(({ produtoId, produtoNome, tamanho, quantidade, precoUnitario, subtotal }) => ({
        produtoId, produtoNome, tamanho, quantidade, precoUnitario, subtotal,
      }))

      // 3) Parcelas (nota promissória)
      let parcelas: Array<{ clienteNome: string; clienteTelefone: string; numero: number; totalParcelas: number; valor: number; valorPago: number; dataVencimento: string; status: string; pagamentos: unknown[] }> | undefined
      if (formaPagamento === 'promissoria') {
        parcelas = []
        const restante = pedido.total - entrada
        const valorParcela = Math.round((restante / numeroParcelas) * 100) / 100
        const now = new Date()
        if (entrada > 0) {
          parcelas.push({ clienteNome, clienteTelefone, numero: 0, totalParcelas: numeroParcelas, valor: entrada, valorPago: 0, dataVencimento: now.toISOString(), status: 'pendente', pagamentos: [] })
        }
        for (let i = 1; i <= numeroParcelas; i++) {
          const due = new Date(now); due.setMonth(due.getMonth() + i)
          parcelas.push({ clienteNome, clienteTelefone, numero: i, totalParcelas: numeroParcelas, valor: valorParcela, valorPago: 0, dataVencimento: due.toISOString(), status: 'pendente', pagamentos: [] })
        }
      }

      // 4) Executar a venda (baixa de estoque transacional) e vincular ao pedido
      const vendaId = await executarVenda({
        clienteId, clienteNome, clienteCidade, itens, total: pedido.total, formaPagamento,
        entrada: formaPagamento === 'promissoria' ? entrada : 0,
        numeroParcelas: formaPagamento === 'promissoria' ? numeroParcelas : 1,
        observacoes: `Pedido online #${pedido.id.slice(0, 8)}`,
        parcelas,
      })
      await marcarPedidoFinalizado(pedido.id, vendaId)

      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['pedidos-novos-count'] })
      qc.invalidateQueries({ queryKey: ['vendas'] })
      qc.invalidateQueries({ queryKey: ['produtos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Pedido finalizado e venda registrada!')
      setFinalizando(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao finalizar o pedido')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelar(p: Pedido) {
    try {
      await cancelarPedido(p.id)
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['pedidos-novos-count'] })
      toast.success('Pedido cancelado')
      setCancelando(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar')
    }
  }

  async function copiarLink() {
    if (!linkCatalogo) return
    await navigator.clipboard.writeText(linkCatalogo)
    setCopiado(true); toast.success('Link copiado!'); setTimeout(() => setCopiado(false), 2000)
  }

  async function compartilharWhatsApp() {
    if (!linkCatalogo) return
    const msg = `🛍️ Confira o catálogo da ${nomeApp} e faça seu pedido:\n${linkCatalogo}`
    // Web Share API (nativo do celular) quando disponível; senão, abre o WhatsApp
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: nomeApp, text: msg, url: linkCatalogo }); return } catch { /* cancelado */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div className="space-y-4">
      {/* Compartilhar o catálogo */}
      {catalogoAtivo && linkCatalogo ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3 px-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Store className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Seu catálogo online</p>
                <code className="text-xs text-muted-foreground break-all">{linkCatalogo}</code>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={compartilharWhatsApp}>
                <Share2 className="h-4 w-4 mr-1.5" />Compartilhar
              </Button>
              <Button size="sm" variant="outline" onClick={copiarLink}>
                {copiado ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}{copiado ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-3 px-4 text-sm text-muted-foreground flex items-center gap-2">
            <Store className="h-4 w-4 shrink-0" />
            Ative seu catálogo online em <strong>Configurações → Loja Online</strong> para receber pedidos e compartilhar o link.
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardList className="h-5 w-5" />Pedidos</h1>
          <p className="text-sm text-muted-foreground">Pedidos recebidos pelo catálogo online · finalize para gerar a venda e baixar o estoque</p>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'novos' | 'todos')}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="novos">Novos</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      ) : lista.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-20" />
          Nenhum pedido {statusFilter === 'novos' ? 'novo' : 'registrado'}.
          <p className="text-xs mt-1">Compartilhe o link do seu catálogo (em Configurações → Loja Online) para receber pedidos.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {lista.map((p) => (
            <Card key={p.id}>
              <CardContent className="py-3 px-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{p.clienteNome}</p>
                      <Badge variant={statusConfig[p.status].variant} className="text-xs shrink-0">{statusConfig[p.status].label}</Badge>
                      <span className="text-xs text-muted-foreground">#{p.id.slice(0, 8)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.createdAt)}
                      {p.clienteTelefone ? ` · ${formatPhone(p.clienteTelefone)}` : ''}
                      {p.clienteCidade ? ` · ${p.clienteCidade}` : ''}
                    </p>
                    {p.clienteEndereco && <p className="text-xs text-muted-foreground truncate">{p.clienteEndereco}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.clienteTelefone && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="WhatsApp do cliente"
                        onClick={() => window.open(buildWhatsAppUrl(p.clienteTelefone, `Olá ${p.clienteNome}! Sobre o seu pedido...`), '_blank')}>
                        <MessageCircle className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    {p.status === 'novo' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => abrirFinalizar(p)}>
                            <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />Finalizar venda
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setCancelando(p)}>
                            <XCircle className="mr-2 h-4 w-4" />Cancelar pedido
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1">
                  {p.itens.map((it, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5"><Package className="h-3.5 w-3.5 shrink-0" />{it.produtoNome}{it.tamanho ? ` (${it.tamanho})` : ''} ×{it.quantidade}</span>
                      <span>{formatCurrency(it.subtotal)}</span>
                    </div>
                  ))}
                  {p.observacoes && <p className="text-xs text-muted-foreground pt-1 border-t mt-1">Obs: {p.observacoes}</p>}
                  <div className="flex justify-between font-bold text-base pt-1 border-t"><span>Total</span><span>{formatCurrency(p.total)}</span></div>
                </div>

                {p.status === 'novo' && (
                  <Button className="w-full" onClick={() => abrirFinalizar(p)}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />Finalizar venda
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de finalização */}
      <Dialog open={!!finalizando} onOpenChange={(o) => { if (!o) setFinalizando(null) }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Finalizar pedido</DialogTitle></DialogHeader>
          {finalizando && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setModoCliente('novo')}
                    className={`text-sm px-3 py-2 rounded-lg border transition-colors font-medium ${modoCliente === 'novo' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
                    Novo (dados do pedido)
                  </button>
                  <button type="button" onClick={() => setModoCliente('existente')}
                    className={`text-sm px-3 py-2 rounded-lg border transition-colors font-medium ${modoCliente === 'existente' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
                    Cliente existente
                  </button>
                </div>
                {modoCliente === 'novo' ? (
                  <div className="rounded-lg border bg-muted/20 p-2.5 text-xs text-muted-foreground">
                    Será criado: <strong className="text-foreground">{finalizando.clienteNome}</strong>
                    {finalizando.clienteCpfCnpj ? ` · ${finalizando.clienteCpfCnpj}` : ''}
                    {finalizando.clienteTelefone ? ` · ${formatPhone(finalizando.clienteTelefone)}` : ''}
                  </div>
                ) : (
                  <Combobox options={clientes.map((c) => ({ value: c.id, label: c.nome, sublabel: c.cidade }))} value={clienteExistenteId} onSelect={setClienteExistenteId} placeholder="Selecione o cliente" searchPlaceholder="Buscar cliente..." emptyMessage="Nenhum cliente encontrado" />
                )}
              </div>

              <div className="space-y-1">
                <Label>Forma de pagamento</Label>
                <div className="grid grid-cols-2 gap-2">
                  {fpOptions.map((fp) => (
                    <button key={fp.value} type="button" onClick={() => setFormaPagamento(fp.value)}
                      className={`text-sm px-3 py-2 rounded-lg border transition-colors font-medium ${formaPagamento === fp.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
                      {fp.label}
                    </button>
                  ))}
                </div>
              </div>

              {formaPagamento === 'promissoria' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Entrada (R$)</Label><Input type="number" min="0" step="0.01" value={entrada} onChange={(e) => setEntrada(Number(e.target.value))} /></div>
                  <div className="space-y-1"><Label>Nº de Parcelas</Label><Input type="number" min="1" max="24" value={numeroParcelas} onChange={(e) => setNumeroParcelas(Math.max(1, Number(e.target.value) || 1))} /></div>
                  <p className="col-span-2 text-xs text-muted-foreground">{numeroParcelas}× de {formatCurrency((finalizando.total - entrada) / numeroParcelas)} mensais</p>
                </div>
              )}

              <Separator />
              <div className="space-y-1">
                {finalizando.itens.map((it, i) => (
                  <div key={i} className="flex justify-between text-sm"><span className="text-muted-foreground">{it.produtoNome}{it.tamanho ? ` (${it.tamanho})` : ''} ×{it.quantidade}</span><span>{formatCurrency(it.subtotal)}</span></div>
                ))}
                <div className="flex justify-between font-bold text-base pt-1"><span>Total</span><span>{formatCurrency(finalizando.total)}</span></div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setFinalizando(null)}>Voltar</Button>
            <Button onClick={finalizar} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar venda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar cancelamento */}
      <Dialog open={!!cancelando} onOpenChange={(o) => { if (!o) setCancelando(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar pedido?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">O pedido de <strong>{cancelando?.clienteNome}</strong> será marcado como cancelado. O estoque não é afetado.</p>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setCancelando(null)}>Voltar</Button>
            <Button variant="destructive" onClick={() => cancelando && handleCancelar(cancelando)}>Cancelar pedido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
