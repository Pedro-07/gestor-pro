'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchProdutosByNome, fetchClientes, executarVenda, criarConsignacao } from '@/lib/database'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { BarcodeScanner } from '@/components/shared/barcode-scanner'
import Image from 'next/image'
import {
  Search, Trash2, ShoppingCart, MoreVertical,
  Loader2, CheckCircle2, Package,
} from 'lucide-react'
import { toast } from 'sonner'

const FP_OPTIONS: { value: FormaPagamento; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'promissoria', label: 'Nota Promissória' },
  { value: 'consignado', label: 'Consignado' },
]

interface CartItem {
  produtoId: string
  produtoNome: string
  tamanho: Tamanho
  quantidade: number
  precoUnitario: number
  subtotal: number
  estoqueDisponivel: number
  fotoUrl?: string
}

export default function PDVPage() {
  const { usarTamanhos, tamanhos, meiosPagamento } = useAppConfig()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('dinheiro')
  const [descontoPct, setDescontoPct] = useState(0)
  const [numeroParcelas, setNumeroParcelas] = useState(2)
  const [entrada, setEntrada] = useState(0)
  const [saving, setSaving] = useState(false)
  const [successDialog, setSuccessDialog] = useState(false)
  const [ultimaOperacao, setUltimaOperacao] = useState<'venda' | 'consignacao'>('venda')
  const searchRef = useRef<HTMLInputElement>(null)

  const { data: produtos = [] } = useQuery({ queryKey: ['produtos'], queryFn: fetchProdutosByNome })
  const { data: clientes = [] } = useQuery({ queryKey: ['clientes'], queryFn: fetchClientes })

  const filtered = produtos
    .filter((p) => {
      if (p.ativo === false) return false
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

  // Meios de pagamento ativos + regra do meio selecionado
  const fpOptions = FP_OPTIONS.filter((fp) => meiosPagamento[fp.value]?.ativo !== false)
  const regraForma = meiosPagamento[formaPagamento]
  const descontoPermitido = !!regraForma?.regra && formaPagamento !== 'consignado'
  const descontoMax = descontoPermitido ? (regraForma?.valor ?? 0) : 0
  const descontoAplicado = descontoPermitido ? Math.min(Math.max(0, descontoPct), descontoMax) : 0
  const totalComDesconto = Math.round(cartTotal * (1 - descontoAplicado / 100) * 100) / 100
  const comissaoConsignado = formaPagamento === 'consignado' && meiosPagamento.consignado?.regra ? (meiosPagamento.consignado?.valor ?? 0) : 0

  const handleBarcodeDetected = useCallback((code: string) => {
    const produto = produtos.find((p) => p.codigoBarras === code || p.codigo === code)
    if (!produto) {
      toast.error(`Produto não encontrado: ${code}`)
      setSearch(code)
      return
    }
    if (produto.ativo === false) {
      toast.error(`${produto.nome} está desativado`)
      return
    }
    const tamanho = usarTamanhos
      ? tamanhos.find((t) => (produto.estoque[t] ?? 0) > 0)
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
    const tam: Tamanho = usarTamanhos ? tamanho : 'M'
    const totalEstoque = Object.values(produto.estoque).reduce((a, b) => a + b, 0)
    const estoqueDisp = usarTamanhos ? (produto.estoque[tamanho] ?? 0) : totalEstoque
    if (estoqueDisp === 0) { toast.error(usarTamanhos ? 'Sem estoque nesse tamanho' : 'Sem estoque'); return }
    // Decide sucesso/erro ANTES do updater para dar feedback correto
    const existente = cart.find((i) => i.produtoId === produto.id && i.tamanho === tam)
    if (existente && existente.quantidade >= estoqueDisp) { toast.error('Estoque insuficiente'); return }

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.produtoId === produto.id && i.tamanho === tam)
      if (idx >= 0) {
        const existing = prev[idx]
        if (existing.quantidade >= estoqueDisp) return prev
        const updated = [...prev]
        updated[idx] = { ...existing, quantidade: existing.quantidade + 1, subtotal: (existing.quantidade + 1) * existing.precoUnitario }
        return updated
      }
      return [...prev, {
        produtoId: produto.id, produtoNome: produto.nome, tamanho: tam,
        quantidade: 1, precoUnitario: produto.precoVenda, subtotal: produto.precoVenda,
        estoqueDisponivel: estoqueDisp, fotoUrl: produto.fotoUrl,
      }]
    })
    const proxQtd = existente ? existente.quantidade + 1 : 1
    toast.success(`${produto.nome} adicionado${usarTamanhos ? ` (${tam})` : ''} — ${proxQtd}× no carrinho`)
    setSearch('')
    searchRef.current?.focus()
  }

  function setQty(idx: number, value: number) {
    setCart((prev) => {
      const updated = [...prev]
      const item = updated[idx]
      let q = Math.floor(value || 0)
      if (q < 1) q = 1
      if (q > item.estoqueDisponivel) { q = item.estoqueDisponivel; toast.error('Estoque insuficiente') }
      updated[idx] = { ...item, quantidade: q, subtotal: q * item.precoUnitario }
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

      // Consignação: entrega ao lojista (baixa estoque, não fatura até o acerto)
      if (formaPagamento === 'consignado') {
        // Comissão reduz o preço de repasse (o lojista fica com a comissão)
        const fator = 1 - comissaoConsignado / 100
        await criarConsignacao({
          clienteId, clienteNome: cliente.nome, clienteCidade: cliente.cidade,
          clienteTelefone: cliente.telefone ?? '',
          itens: cart.map(({ produtoId, produtoNome, tamanho, quantidade, precoUnitario }) => ({
            produtoId, produtoNome, tamanho, quantidade,
            precoUnitario: Math.round(precoUnitario * fator * 100) / 100,
          })),
          observacoes: comissaoConsignado > 0 ? `Comissão do lojista: ${comissaoConsignado}%` : undefined,
        })

        qc.invalidateQueries({ queryKey: ['consignacoes'] })
        qc.invalidateQueries({ queryKey: ['produtos'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })

        setCart([]); setClienteId(''); setFormaPagamento('dinheiro'); setEntrada(0); setNumeroParcelas(2); setDescontoPct(0)
        setUltimaOperacao('consignacao')
        setCheckoutOpen(false); setSuccessDialog(true)
        return
      }

      // Montar parcelas se promissória
      let parcelas: Array<{
        clienteNome: string; clienteTelefone: string; numero: number; totalParcelas: number;
        valor: number; valorPago: number; dataVencimento: string; status: string; pagamentos: unknown[]
      }> | undefined

      if (formaPagamento === 'promissoria') {
        parcelas = []
        const valorRestante = totalComDesconto - entrada
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
        itens, total: totalComDesconto, formaPagamento,
        entrada: formaPagamento === 'promissoria' ? entrada : 0,
        numeroParcelas: formaPagamento === 'promissoria' ? numeroParcelas : 1,
        observacoes: descontoAplicado > 0 ? `Desconto ${descontoAplicado}% (-${formatCurrency(cartTotal - totalComDesconto)})` : undefined,
        parcelas,
      })

      qc.invalidateQueries({ queryKey: ['vendas'] })
      qc.invalidateQueries({ queryKey: ['produtos'] })
      qc.invalidateQueries({ queryKey: ['parcelas'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })

      setCart([]); setClienteId(''); setFormaPagamento('dinheiro'); setEntrada(0); setNumeroParcelas(2); setDescontoPct(0)
      setUltimaOperacao('venda')
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
              onKeyDown={(e) => { if (e.key === 'Enter' && filtered.length === 1) { const p = filtered[0]; const t = usarTamanhos ? tamanhos.find((t) => (p.estoque[t] ?? 0) > 0) : 'M'; if (t) addToCart(p, t) } }} />
          </div>
          <BarcodeScanner onDetected={handleBarcodeDetected} label="Ler código" className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:text-white" />
        </div>
        {!search.trim() ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3 text-center">
            <Search className="h-10 w-10 opacity-25" />
            <p className="text-sm max-w-xs">Busque um produto pelo nome, código ou EAN — ou use o leitor de código de barras.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Nenhum produto com estoque encontrado para “{search}”.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map((p) => {
              const total = Object.values(p.estoque).reduce((a, b) => a + b, 0)
              const tamsComEstoque = tamanhos.filter((t) => (p.estoque[t] ?? 0) > 0)
              return (
                <div key={p.id} className="flex items-center gap-2.5 rounded-xl border bg-card p-2 hover:border-primary/40 transition-colors">
                  <div className="h-11 w-11 shrink-0 rounded-lg bg-muted border flex items-center justify-center overflow-hidden">
                    {p.fotoUrl
                      ? <Image src={p.fotoUrl} alt={p.nome} width={44} height={44} className="object-cover w-full h-full" />
                      : <Package className="h-5 w-5 text-muted-foreground/40" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">{p.nome}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className="text-[10px] font-mono px-1">{p.codigo}</Badge>
                      <span className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(p.precoVenda)}</span>
                    </div>
                  </div>
                  {usarTamanhos && tamsComEstoque.length > 1 ? (
                    <Popover>
                      <PopoverTrigger
                        disabled={total === 0}
                        title="Escolher tamanho"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <ShoppingCart className="h-4 w-4" />
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-auto p-2">
                        <p className="text-[10px] text-muted-foreground mb-1.5 px-0.5">Escolha o tamanho</p>
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {tamsComEstoque.map((t) => (
                            <button key={t} onClick={() => addToCart(p, t)}
                              className="text-xs px-2 py-1 rounded border border-primary text-primary font-semibold hover:bg-primary hover:text-primary-foreground active:scale-95 transition-colors">
                              {t}<span className="ml-0.5 font-normal opacity-70">({p.estoque[t]})</span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <Button size="icon" disabled={total === 0}
                      onClick={() => addToCart(p, usarTamanhos ? (tamsComEstoque[0] ?? 'M') : 'M')}
                      className="h-10 w-10 rounded-xl shrink-0" title="Adicionar ao carrinho">
                      <ShoppingCart className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )
            })}
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
                <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 rounded-xl border p-2">
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-muted border flex items-center justify-center overflow-hidden">
                        {item.fotoUrl
                          ? <Image src={item.fotoUrl} alt={item.produtoNome} width={40} height={40} className="object-cover w-full h-full" />
                          : <Package className="h-4 w-4 text-muted-foreground/40" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">{item.produtoNome}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {usarTamanhos ? `${item.tamanho} · ` : ''}{formatCurrency(item.precoUnitario)} · <span className="font-semibold text-foreground">{formatCurrency(item.subtotal)}</span>
                        </p>
                      </div>
                      <Input type="number" min={1} max={item.estoqueDisponivel} value={item.quantidade}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setQty(idx, Number(e.target.value))}
                        className="w-12 h-8 px-1 text-center shrink-0" />
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="text-destructive" onClick={() => removeItem(idx)}>
                            <Trash2 className="mr-2 h-4 w-4" />Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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

      {/* Barra de carrinho fixa (mobile) — sempre visível acima do menu inferior */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-30 px-3 lg:hidden">
          <div className="flex items-center gap-3 rounded-xl border bg-card shadow-lg px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative shrink-0">
                <ShoppingCart className="h-5 w-5" />
                <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {cart.reduce((s, i) => s + i.quantidade, 0)}
                </span>
              </div>
              <span className="font-bold text-base truncate">{formatCurrency(cartTotal)}</span>
            </div>
            <Button className="ml-auto shrink-0" size="sm" onClick={() => setCheckoutOpen(true)}>
              Finalizar
            </Button>
          </div>
        </div>
      )}

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
                {fpOptions.map((fp) => (
                  <button key={fp.value} type="button" onClick={() => { setFormaPagamento(fp.value); setDescontoPct(0) }}
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
                {entrada > 0 && <p className="col-span-2 text-xs text-muted-foreground">{numeroParcelas}× de {formatCurrency((totalComDesconto - entrada) / numeroParcelas)} mensais</p>}
              </div>
            )}
            {descontoPermitido && (
              <div className="space-y-1">
                <Label>Desconto (%) <span className="text-xs font-normal text-muted-foreground">— máximo {descontoMax}%</span></Label>
                <Input type="number" min={0} max={descontoMax} step="0.5" value={descontoPct}
                  onChange={(e) => setDescontoPct(Math.max(0, Math.min(descontoMax, Number(e.target.value) || 0)))} />
              </div>
            )}
            {formaPagamento === 'consignado' && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-amber-600 dark:text-amber-400">Entrega em consignação</p>
                <p>As peças saem do seu estoque agora, mas <strong>nada é faturado</strong>. O lojista paga só o que vender (ao preço de repasse = preço de venda) e devolve o restante no acerto de contas, em <strong>Consignações</strong>.</p>
                <p className="pt-1">Valor potencial (se vender tudo): <strong className="text-foreground font-mono">{formatCurrency(cartTotal)}</strong></p>
                {comissaoConsignado > 0 && <p>Comissão do lojista: <strong className="text-amber-600 dark:text-amber-400">{comissaoConsignado}%</strong> — o repasse a receber por peça vendida é o preço de venda menos a comissão.</p>}
              </div>
            )}
            <Separator />
            <div className="space-y-1">
              {cart.map((item, i) => (<div key={i} className="flex justify-between text-sm"><span className="text-muted-foreground">{item.produtoNome}{usarTamanhos ? ` (${item.tamanho})` : ''} ×{item.quantidade}</span><span>{formatCurrency(item.subtotal)}</span></div>))}
              {descontoAplicado > 0 && (
                <>
                  <div className="flex justify-between text-sm pt-1"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(cartTotal)}</span></div>
                  <div className="flex justify-between text-sm text-green-600 dark:text-green-400"><span>Desconto ({descontoAplicado}%)</span><span>-{formatCurrency(cartTotal - totalComDesconto)}</span></div>
                </>
              )}
              <div className="flex justify-between font-bold text-base pt-1"><span>Total</span><span>{formatCurrency(descontoAplicado > 0 ? totalComDesconto : cartTotal)}</span></div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Voltar</Button>
            <Button onClick={handleFinalizarVenda} disabled={saving || !clienteId}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{formaPagamento === 'consignado' ? 'Confirmar Consignação' : 'Confirmar Venda'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successDialog} onOpenChange={setSuccessDialog}>
        <DialogContent className="max-w-xs text-center">
          <div className="space-y-3 py-4">
            <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold">{ultimaOperacao === 'consignacao' ? 'Consignação registrada!' : 'Venda realizada!'}</h2>
            <p className="text-sm text-muted-foreground">{ultimaOperacao === 'consignacao' ? 'As peças foram entregues. Faça o acerto em Consignações quando o lojista prestar contas.' : 'A venda foi registrada com sucesso.'}</p>
          </div>
          <DialogFooter><Button className="w-full" onClick={() => setSuccessDialog(false)}>{ultimaOperacao === 'consignacao' ? 'Nova Operação' : 'Nova Venda'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
