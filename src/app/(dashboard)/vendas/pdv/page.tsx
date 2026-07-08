'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchProdutosByNome, fetchClientes, executarVenda } from '@/lib/database'
import type { Produto, Cliente, Tamanho, FormaPagamento, ItemVenda } from '@/types'
import { useAppConfig } from '@/hooks/useAppConfig'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox } from '@/components/shared/combobox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { BarcodeScanner } from '@/components/shared/barcode-scanner'
import {
  Search, Plus, Minus, Trash2, ShoppingCart,
  Loader2, CheckCircle2, Package,
} from 'lucide-react'
import { toast } from 'sonner'

const TAMANHOS: Tamanho[] = ['PP', 'P', 'M', 'G', 'GG', 'XGG']
const FP_OPTIONS: { value: FormaPagamento; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'promissoria', label: 'Nota Promissória' },
]

interface CartItem {
  produtoId: string
  produtoNome: string
  tamanho: Tamanho
  quantidade: number
  precoUnitario: number
  subtotal: number
  estoqueDisponivel: number
}

export default function PDVPage() {
  const { usarTamanhos } = useAppConfig()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('dinheiro')
  const [numeroParcelas, setNumeroParcelas] = useState(2)
  const [entrada, setEntrada] = useState(0)
  const [saving, setSaving] = useState(false)
  const [successDialog, setSuccessDialog] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const { data: produtos = [] } = useQuery({ queryKey: ['produtos'], queryFn: fetchProdutosByNome })
  const { data: clientes = [] } = useQuery({ queryKey: ['clientes'], queryFn: fetchClientes })

  const filtered = produtos
    .filter((p) => {
      const hasStock = Object.values(p.estoque).some((q) => q > 0)
      if (!hasStock) return false
      if (!search.trim()) return true
      return (
        p.nome.toLowerCase().includes(search.toLowerCase()) ||
        p.codigo?.toLowerCase().includes(search.toLowerCase()) ||
        (p.codigoBarras ?? '').includes(search)
      )
    })

  const cartTotal = cart.reduce((s, i) => s + i.subtotal, 0)

  const handleBarcodeDetected = useCallback((code: string) => {
    const produto = produtos.find((p) => p.codigoBarras === code || p.codigo === code)
    if (!produto) {
      toast.error(`Produto não encontrado: ${code}`)
      setSearch(code)
      return
    }
    const tamanho = usarTamanhos
      ? TAMANHOS.find((t) => (produto.estoque[t] ?? 0) > 0)
      : 'M'
    if (!tamanho) {
      toast.error(`${produto.nome} — sem estoque disponível`)
      return
    }
    const totalEstoque = Object.values(produto.estoque).reduce((a, b) => a + b, 0)
    if (!usarTamanhos && totalEstoque <= 0) {
      toast.error(`${produto.nome} — sem estoque disponível`)
      return
    }
    addToCart(produto, tamanho)
  }, [produtos, usarTamanhos]) // eslint-disable-line react-hooks/exhaustive-deps

  function addToCart(produto: Produto, tamanho: Tamanho) {
    const totalEstoque = Object.values(produto.estoque).reduce((a, b) => a + b, 0)
    const estoqueDisp = usarTamanhos ? (produto.estoque[tamanho] ?? 0) : totalEstoque
    if (estoqueDisp === 0) { toast.error(usarTamanhos ? 'Sem estoque nesse tamanho' : 'Sem estoque'); return }
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.produtoId === produto.id && i.tamanho === (usarTamanhos ? tamanho : 'M'))
      if (idx >= 0) {
        const existing = prev[idx]
        if (existing.quantidade >= estoqueDisp) { toast.error('Estoque insuficiente'); return prev }
        const updated = [...prev]
        updated[idx] = { ...existing, quantidade: existing.quantidade + 1, subtotal: (existing.quantidade + 1) * existing.precoUnitario }
        return updated
      }
      return [...prev, {
        produtoId: produto.id, produtoNome: produto.nome, tamanho: usarTamanhos ? tamanho : 'M',
        quantidade: 1, precoUnitario: produto.precoVenda, subtotal: produto.precoVenda, estoqueDisponivel: estoqueDisp,
      }]
    })
    setSearch('')
    searchRef.current?.focus()
  }

  function updateQty(idx: number, delta: number) {
    setCart((prev) => {
      const updated = [...prev]
      const item = updated[idx]
      const newQty = item.quantidade + delta
      if (newQty <= 0) { updated.splice(idx, 1); return updated }
      if (newQty > item.estoqueDisponivel) { toast.error('Estoque insuficiente'); return prev }
      updated[idx] = { ...item, quantidade: newQty, subtotal: newQty * item.precoUnitario }
      return updated
    })
  }

  function removeItem(idx: number) { setCart((prev) => prev.filter((_, i) => i !== idx)) }

  async function handleFinalizarVenda() {
    if (cart.length === 0) { toast.error('Carrinho vazio'); return }
    if (!clienteId) { toast.error('Selecione um cliente'); return }

    const cliente = clientes.find((c) => c.id === clienteId)!
    setSaving(true)
    try {
      const itens: ItemVenda[] = cart.map(({ produtoId, produtoNome, tamanho, quantidade, precoUnitario, subtotal }) => ({
        produtoId, produtoNome, tamanho, quantidade, precoUnitario, subtotal,
      }))

      // Montar parcelas se promissória
      let parcelas: Array<{
        clienteNome: string; clienteTelefone: string; numero: number; totalParcelas: number;
        valor: number; valorPago: number; dataVencimento: string; status: string; pagamentos: unknown[]
      }> | undefined

      if (formaPagamento === 'promissoria') {
        parcelas = []
        const valorRestante = cartTotal - entrada
        const valorParcela = Math.round((valorRestante / numeroParcelas) * 100) / 100
        const now = new Date()

        if (entrada > 0) {
          parcelas.push({
            clienteNome: cliente.nome, clienteTelefone: cliente.telefone ?? '',
            numero: 0, totalParcelas: numeroParcelas, valor: entrada,
            valorPago: 0, dataVencimento: now.toISOString(), status: 'pendente', pagamentos: [],
          })
        }

        for (let i = 1; i <= numeroParcelas; i++) {
          const dueDate = new Date(now)
          dueDate.setMonth(dueDate.getMonth() + i)
          parcelas.push({
            clienteNome: cliente.nome, clienteTelefone: cliente.telefone ?? '',
            numero: i, totalParcelas: numeroParcelas, valor: valorParcela,
            valorPago: 0, dataVencimento: dueDate.toISOString(), status: 'pendente', pagamentos: [],
          })
        }
      }

      await executarVenda({
        clienteId, clienteNome: cliente.nome, clienteCidade: cliente.cidade,
        itens, total: cartTotal, formaPagamento,
        entrada: formaPagamento === 'promissoria' ? entrada : 0,
        numeroParcelas: formaPagamento === 'promissoria' ? numeroParcelas : 1,
        parcelas,
      })

      qc.invalidateQueries({ queryKey: ['vendas'] })
      qc.invalidateQueries({ queryKey: ['produtos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })

      setCart([]); setClienteId(''); setFormaPagamento('dinheiro'); setEntrada(0); setNumeroParcelas(2)
      setCheckoutOpen(false); setSuccessDialog(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao finalizar venda')
    } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      <div className="flex-1 space-y-4 min-w-0">
        <div><h1 className="text-xl font-bold">PDV — Ponto de Venda</h1><p className="text-sm text-muted-foreground">Busque produtos ou leia o código de barras</p></div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input ref={searchRef} placeholder="Buscar produto, código interno ou EAN..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && filtered.length === 1) { const p = filtered[0]; const t = usarTamanhos ? TAMANHOS.find((t) => (p.estoque[t] ?? 0) > 0) : 'M'; if (t) addToCart(p, t) } }} />
          </div>
          <BarcodeScanner compact onDetected={handleBarcodeDetected} label="Ler código" />
        </div>
        {produtos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3"><Package className="h-12 w-12 opacity-30" /><p className="text-sm">Nenhum produto cadastrado no estoque</p></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum produto com estoque encontrado</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((p) => (
              <Card key={p.id} className="hover:border-primary/50 transition-colors cursor-default">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="font-medium text-sm leading-tight truncate">{p.nome}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-[10px] font-mono px-1">{p.codigo}</Badge>
                        <span className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(p.precoVenda)}</span>
                      </div>
                    </div>
                  </div>
                  {usarTamanhos ? (
                    <div className="flex flex-wrap gap-1">
                      {TAMANHOS.map((t) => { const qty = p.estoque[t] ?? 0; return (
                        <button key={t} disabled={qty === 0} onClick={() => addToCart(p, t)}
                          className={`text-xs px-2 py-1 rounded border font-semibold transition-colors ${qty === 0
                            ? 'opacity-25 cursor-not-allowed border-border text-muted-foreground'
                            : 'hover:bg-primary hover:text-primary-foreground border-primary text-primary cursor-pointer active:scale-95'}`}>
                          {t}<span className="ml-0.5 font-normal opacity-70">({qty})</span>
                        </button>
                      ) })}
                    </div>
                  ) : (
                    <Button
                      disabled={Object.values(p.estoque).reduce((a, b) => a + b, 0) === 0}
                      onClick={() => addToCart(p, 'M')}
                      className="w-full text-xs py-1 h-8"
                    >
                      Adicionar à Venda <span className="ml-1 opacity-70">({Object.values(p.estoque).reduce((a, b) => a + b, 0)})</span>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="w-full lg:w-80 shrink-0">
        <Card className="sticky top-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" />Carrinho
              {cart.length > 0 && <Badge className="ml-auto">{cart.reduce((s, i) => s + i.quantidade, 0)} pç</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground"><Package className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-xs">Carrinho vazio</p></div>
            ) : (
              <>
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <div className="flex-1 min-w-0"><p className="font-medium truncate leading-tight">{item.produtoNome}</p><p className="text-xs text-muted-foreground">{usarTamanhos ? `${item.tamanho} — ` : ''}{formatCurrency(item.precoUnitario)}</p></div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQty(idx, -1)}><Minus className="h-3 w-3" /></Button>
                        <span className="w-5 text-center font-semibold">{item.quantidade}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQty(idx, 1)}><Plus className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg"><span>Total</span><span>{formatCurrency(cartTotal)}</span></div>
                <Button className="w-full" size="lg" onClick={() => setCheckoutOpen(true)}><ShoppingCart className="mr-2 h-4 w-4" />Finalizar Venda</Button>
                <Button variant="outline" className="w-full text-destructive" size="sm" onClick={() => setCart([])}>Limpar carrinho</Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Checkout Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Finalizar Venda</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1"><Label>Cliente *</Label>
              <Combobox options={clientes.map((c) => ({ value: c.id, label: c.nome, sublabel: c.cidade }))} value={clienteId} onSelect={setClienteId} placeholder="Selecione o cliente" searchPlaceholder="Buscar cliente..." emptyMessage="Nenhum cliente encontrado" />
            </div>
            <div className="space-y-1"><Label>Forma de Pagamento</Label>
              <div className="grid grid-cols-2 gap-2">
                {FP_OPTIONS.map((fp) => (
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
                <div className="space-y-1"><Label>Nº de Parcelas</Label><Input type="number" min="1" max="24" value={numeroParcelas} onChange={(e) => setNumeroParcelas(Number(e.target.value))} /></div>
                {entrada > 0 && <p className="col-span-2 text-xs text-muted-foreground">{numeroParcelas}× de {formatCurrency((cartTotal - entrada) / numeroParcelas)} mensais</p>}
              </div>
            )}
            <Separator />
            <div className="space-y-1">
              {cart.map((item, i) => (<div key={i} className="flex justify-between text-sm"><span className="text-muted-foreground">{item.produtoNome}{usarTamanhos ? ` (${item.tamanho})` : ''} ×{item.quantidade}</span><span>{formatCurrency(item.subtotal)}</span></div>))}
              <div className="flex justify-between font-bold text-base pt-1"><span>Total</span><span>{formatCurrency(cartTotal)}</span></div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Voltar</Button>
            <Button onClick={handleFinalizarVenda} disabled={saving || !clienteId}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar Venda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successDialog} onOpenChange={setSuccessDialog}>
        <DialogContent className="max-w-xs text-center">
          <div className="space-y-3 py-4">
            <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold">Venda realizada!</h2>
            <p className="text-sm text-muted-foreground">A venda foi registrada com sucesso.</p>
          </div>
          <DialogFooter><Button className="w-full" onClick={() => setSuccessDialog(false)}>Nova Venda</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
