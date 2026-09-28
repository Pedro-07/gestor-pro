'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import { fetchCatalogoLoja, fetchCatalogoProdutos, criarPedidoPublico } from '@/lib/database'
import type { CatalogoProduto, PedidoItem, Tamanho } from '@/types'
import { formatCurrency, maskCPFCNPJ, maskPhone, onlyLetters, isValidCPF, isValidCNPJ, buildWhatsAppUrl } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { ShoppingCart, ShoppingBag, Package, Search, Plus, Minus, Trash2, Store, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

interface CartItem {
  produtoId: string
  produtoNome: string
  tamanho: Tamanho
  quantidade: number
  precoUnitario: number
  subtotal: number
  estoqueDisponivel: number
  fotoUrl?: string | null
}

type Etapa = 'cadastro' | 'sucesso'

export default function CatalogoPage({ params }: { params: { slug: string } }) {
  const slug = params.slug

  const { data: loja, isLoading: loadingLoja, isError } = useQuery({
    queryKey: ['catalogo-loja', slug],
    queryFn: () => fetchCatalogoLoja(slug),
  })
  const { data: produtos = [], isLoading: loadingProdutos } = useQuery({
    queryKey: ['catalogo-produtos', slug],
    queryFn: () => fetchCatalogoProdutos(slug),
    enabled: !!loja,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  })

  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [detalhe, setDetalhe] = useState<CatalogoProduto | null>(null)
  const [tamSel, setTamSel] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [etapa, setEtapa] = useState<Etapa>('cadastro')
  const [saving, setSaving] = useState(false)

  // Dados do cliente
  const [nome, setNome] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cidade, setCidade] = useState('')
  const [endereco, setEndereco] = useState('')
  const [obs, setObs] = useState('')

  // Resultado do pedido (para o resumo/WhatsApp)
  const [resumo, setResumo] = useState<{ itens: PedidoItem[]; total: number; pedidoId: string } | null>(null)

  const usarTamanhos = loja?.usarTamanhos !== false
  const cartTotal = cart.reduce((s, i) => s + i.subtotal, 0)
  const cartCount = cart.reduce((s, i) => s + i.quantidade, 0)

  const filtered = useMemo(() => produtos.filter((p) => {
    const total = Object.values(p.estoque ?? {}).reduce((a, b) => a + b, 0)
    if (total <= 0) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return p.nome.toLowerCase().includes(q) || (p.codigo ?? '').toLowerCase().includes(q)
  }), [produtos, search])

  function addToCart(produto: CatalogoProduto, tamanho: Tamanho) {
    const tam: Tamanho = usarTamanhos ? tamanho : 'M'
    const total = Object.values(produto.estoque ?? {}).reduce((a, b) => a + b, 0)
    const estoqueDisp = usarTamanhos ? (produto.estoque[tamanho] ?? 0) : total
    if (estoqueDisp <= 0) { toast.error(usarTamanhos ? 'Sem estoque nesse tamanho' : 'Sem estoque'); return }

    const existente = cart.find((i) => i.produtoId === produto.id && i.tamanho === tam)
    if (existente && existente.quantidade >= estoqueDisp) { toast.error('Quantidade máxima em estoque atingida'); return }

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.produtoId === produto.id && i.tamanho === tam)
      if (idx >= 0) {
        const ex = prev[idx]
        if (ex.quantidade >= estoqueDisp) return prev
        const up = [...prev]
        up[idx] = { ...ex, quantidade: ex.quantidade + 1, subtotal: (ex.quantidade + 1) * ex.precoUnitario }
        return up
      }
      return [...prev, {
        produtoId: produto.id, produtoNome: produto.nome, tamanho: tam,
        quantidade: 1, precoUnitario: produto.precoVenda, subtotal: produto.precoVenda,
        estoqueDisponivel: estoqueDisp, fotoUrl: produto.fotoUrl,
      }]
    })
    toast.success(`${produto.nome} adicionado${usarTamanhos ? ` (${tam})` : ''}`)
  }

  function setQty(idx: number, delta: number) {
    setCart((prev) => {
      const up = [...prev]
      const item = up[idx]
      let q = item.quantidade + delta
      if (q < 1) q = 1
      if (q > item.estoqueDisponivel) { q = item.estoqueDisponivel; toast.error('Estoque insuficiente') }
      up[idx] = { ...item, quantidade: q, subtotal: q * item.precoUnitario }
      return up
    })
  }

  function removeItem(idx: number) { setCart((prev) => prev.filter((_, i) => i !== idx)) }

  function abrirCheckout() {
    if (cart.length === 0) { toast.error('Seu carrinho está vazio'); return }
    setEtapa('cadastro')
    setCartOpen(false)
    setCheckoutOpen(true)
  }

  function validarCadastro(): string | null {
    if (nome.trim().length < 3) return 'Informe seu nome completo'
    const req = loja?.camposObrigatoriosCliente
    if (req?.cpfCnpj) {
      const d = cpfCnpj.replace(/\D/g, '')
      const ok = d.length === 11 ? isValidCPF(cpfCnpj) : d.length === 14 ? isValidCNPJ(cpfCnpj) : false
      if (!ok) return 'CPF ou CNPJ inválido'
    }
    if (req?.telefone) {
      const d = telefone.replace(/\D/g, '')
      if (d.length < 10 || d.length > 11) return 'Telefone inválido — informe DDD + número'
    }
    if (req?.cidade && cidade.trim().length < 2) return 'Informe a cidade'
    if (req?.endereco && endereco.trim().length < 5) return 'Informe o endereço completo'
    return null
  }

  async function confirmarPedido() {
    const erro = validarCadastro()
    if (erro) { toast.error(erro); return }
    setSaving(true)
    try {
      const res = await criarPedidoPublico({
        slug,
        cliente: {
          nome: nome.trim(),
          cpfCnpj: cpfCnpj.trim(),
          telefone: telefone.trim(),
          cidade: cidade.trim(),
          endereco: endereco.trim(),
          observacoes: obs.trim(),
        },
        itens: cart.map((i) => ({ produtoId: i.produtoId, tamanho: i.tamanho, quantidade: i.quantidade })),
        observacoes: obs.trim(),
      })
      setResumo({ itens: res.itens, total: res.total, pedidoId: res.pedidoId })
      setCart([])
      setEtapa('sucesso')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar o pedido')
    } finally {
      setSaving(false)
    }
  }

  function mensagemWhatsApp(): string {
    if (!resumo || !loja) return ''
    const linhas: string[] = []
    linhas.push(`*Novo pedido — ${loja.nomeApp}*`, '')
    linhas.push(`*Cliente:* ${nome.trim()}`)
    if (telefone.trim()) linhas.push(`Tel: ${telefone.trim()}`)
    if (cpfCnpj.trim()) linhas.push(`CPF/CNPJ: ${cpfCnpj.trim()}`)
    if (cidade.trim()) linhas.push(`Cidade: ${cidade.trim()}`)
    if (endereco.trim()) linhas.push(`Endereço: ${endereco.trim()}`)
    linhas.push('', '*Itens:*')
    resumo.itens.forEach((i) => {
      linhas.push(`• ${i.quantidade}x ${i.produtoNome}${usarTamanhos ? ` (${i.tamanho})` : ''} — ${formatCurrency(i.subtotal)}`)
    })
    linhas.push('', `*Total: ${formatCurrency(resumo.total)}*`)
    if (obs.trim()) linhas.push('', `Obs: ${obs.trim()}`)
    linhas.push('', `Pedido #${resumo.pedidoId.slice(0, 8)}`)
    return linhas.join('\n')
  }

  // ── Estados de carregamento / erro ──
  if (loadingLoja) {
    return (
      <div className="min-h-screen bg-muted/20 p-4 space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (isError || !loja) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Store className="h-12 w-12 text-muted-foreground opacity-30" />
        <h1 className="text-lg font-semibold">Loja não encontrada</h1>
        <p className="text-sm text-muted-foreground max-w-xs">Este catálogo não existe ou está indisponível no momento. Verifique o link com a loja.</p>
      </div>
    )
  }

  const reqCliente = loja.camposObrigatoriosCliente
  const star = (on?: boolean) => (on ? ' *' : '')

  return (
    <div className="min-h-screen bg-muted/20 pb-28">
      {/* Cabeçalho da loja */}
      <header className="sticky top-0 z-20 bg-card border-b">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 border flex items-center justify-center overflow-hidden shrink-0">
            {loja.logoUrl
              ? <Image src={loja.logoUrl} alt={loja.nomeApp} width={40} height={40} className="object-cover w-full h-full" />
              : <ShoppingBag className="h-5 w-5 text-primary" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold truncate leading-tight">{loja.nomeApp}</h1>
            <p className="text-xs text-muted-foreground">Catálogo online</p>
          </div>
          <button onClick={() => setCartOpen(true)} className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border hover:bg-muted transition-colors shrink-0">
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{cartCount}</span>
            )}
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar produto..." className="pl-9 bg-card" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loadingProdutos ? (
          <div className="grid grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3 text-center">
            <Package className="h-10 w-10 opacity-25" />
            <p className="text-sm">{search.trim() ? 'Nenhum produto encontrado.' : 'Nenhum produto disponível no momento.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p) => {
              const tamsComEstoque = Object.entries(p.estoque ?? {}).filter(([, q]) => q > 0).map(([t]) => t)
              return (
                <button key={p.id} type="button" onClick={() => { setDetalhe(p); setTamSel('') }}
                  className="text-left rounded-xl border bg-card overflow-hidden flex flex-col group focus:outline-none focus:ring-2 focus:ring-ring">
                  <div className="aspect-square bg-muted relative">
                    {p.fotoUrl
                      ? <Image src={p.fotoUrl} alt={p.nome} fill className="object-cover transition-transform group-hover:scale-105" sizes="(max-width: 640px) 50vw, 320px" />
                      : <div className="w-full h-full flex items-center justify-center"><Package className="h-10 w-10 text-muted-foreground/30" /></div>}
                    <span className="absolute bottom-2 right-2 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
                      <ShoppingCart className="h-4 w-4" />
                    </span>
                    {usarTamanhos && tamsComEstoque.length > 0 && (
                      <span className="absolute top-2 left-2 rounded-md bg-black/55 text-white text-[10px] font-medium px-1.5 py-0.5 backdrop-blur-sm">
                        {tamsComEstoque.slice(0, 4).join(' · ')}{tamsComEstoque.length > 4 ? '…' : ''}
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 flex flex-col gap-1 flex-1">
                    <p className="text-sm font-medium leading-tight line-clamp-2">{p.nome}</p>
                    <span className="text-base font-bold text-green-600 dark:text-green-400 mt-auto">{formatCurrency(p.precoVenda)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Barra fixa do carrinho */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 p-3">
          <div className="max-w-2xl mx-auto">
            <Button className="w-full h-12 shadow-lg" size="lg" onClick={() => setCartOpen(true)}>
              <ShoppingCart className="h-5 w-5 mr-2" />
              Ver carrinho ({cartCount}) · {formatCurrency(cartTotal)}
            </Button>
          </div>
        </div>
      )}

      {/* Modal de detalhe do produto */}
      <Dialog open={!!detalhe} onOpenChange={(o) => { if (!o) { setDetalhe(null); setTamSel('') } }}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
          {detalhe && (() => {
            const tams = Object.entries(detalhe.estoque ?? {}).filter(([, q]) => q > 0).map(([t]) => t)
            const total = Object.values(detalhe.estoque ?? {}).reduce((a, b) => a + b, 0)
            const precisaTam = usarTamanhos && tams.length > 0
            const podeAdd = total > 0 && (!precisaTam || !!tamSel)
            return (
              <div className="max-h-[90dvh] overflow-y-auto">
                {/* Imagem grande com gradiente */}
                <div className="relative aspect-square bg-muted">
                  {detalhe.fotoUrl
                    ? <Image src={detalhe.fotoUrl} alt={detalhe.nome} fill className="object-cover" sizes="(max-width: 640px) 100vw, 448px" />
                    : <div className="w-full h-full flex items-center justify-center"><Package className="h-16 w-16 text-muted-foreground/30" /></div>}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-4 pt-12">
                    <h2 className="text-white text-lg font-bold leading-tight drop-shadow">{detalhe.nome}</h2>
                    <p className="text-white text-2xl font-extrabold drop-shadow">{formatCurrency(detalhe.precoVenda)}</p>
                  </div>
                </div>

                {/* Corpo */}
                <div className="p-4 space-y-4">
                  {detalhe.descricao && <p className="text-sm text-muted-foreground whitespace-pre-line">{detalhe.descricao}</p>}

                  {precisaTam && (
                    <div>
                      <p className="text-xs font-medium mb-2">Escolha o tamanho</p>
                      <div className="flex flex-wrap gap-2">
                        {tams.map((t) => (
                          <button key={t} type="button" onClick={() => setTamSel(t)}
                            className={`text-sm px-3 py-1.5 rounded-lg border font-semibold transition-colors ${tamSel === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
                            {t}<span className="ml-1 font-normal opacity-70">({detalhe.estoque[t]})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button className="w-full" size="lg" disabled={!podeAdd}
                    onClick={() => { addToCart(detalhe, precisaTam ? tamSel : 'M'); setDetalhe(null); setTamSel('') }}>
                    <ShoppingCart className="h-5 w-5 mr-2" />
                    {precisaTam && !tamSel ? 'Selecione um tamanho' : 'Adicionar ao carrinho'}
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog do carrinho */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" />Seu carrinho</DialogTitle></DialogHeader>
          {cart.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground"><Package className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">Carrinho vazio</p></div>
          ) : (
            <div className="space-y-3">
              {cart.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2.5 rounded-xl border p-2">
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-muted border flex items-center justify-center overflow-hidden">
                    {item.fotoUrl
                      ? <Image src={item.fotoUrl} alt={item.produtoNome} width={48} height={48} className="object-cover w-full h-full" />
                      : <Package className="h-5 w-5 text-muted-foreground/40" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">{item.produtoNome}</p>
                    <p className="text-[11px] text-muted-foreground">{usarTamanhos ? `${item.tamanho} · ` : ''}{formatCurrency(item.precoUnitario)}</p>
                    <p className="text-sm font-semibold">{formatCurrency(item.subtotal)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setQty(idx, -1)} className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-muted"><Minus className="h-3.5 w-3.5" /></button>
                    <span className="w-6 text-center text-sm font-medium">{item.quantidade}</span>
                    <button onClick={() => setQty(idx, +1)} className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
                    <button onClick={() => removeItem(idx)} className="h-7 w-7 rounded-md flex items-center justify-center text-destructive hover:bg-destructive/10 ml-0.5"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-bold text-lg"><span>Total</span><span>{formatCurrency(cartTotal)}</span></div>
              <Button className="w-full" size="lg" onClick={abrirCheckout}>Continuar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de checkout: cadastro + sucesso */}
      <Dialog open={checkoutOpen} onOpenChange={(o) => { setCheckoutOpen(o); if (!o) setEtapa('cadastro') }}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          {etapa === 'cadastro' ? (
            <>
              <DialogHeader><DialogTitle>Seus dados</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Nome completo *</Label>
                  <Input placeholder="Seu nome" value={nome} onChange={(e) => setNome(onlyLetters(e.target.value))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>CPF / CNPJ{star(reqCliente.cpfCnpj)}</Label>
                    <Input placeholder="000.000.000-00" value={cpfCnpj} onChange={(e) => setCpfCnpj(maskCPFCNPJ(e.target.value))} maxLength={18} />
                  </div>
                  <div className="space-y-1">
                    <Label>Telefone (WhatsApp){star(reqCliente.telefone)}</Label>
                    <Input placeholder="(11) 99999-9999" value={telefone} onChange={(e) => setTelefone(maskPhone(e.target.value))} maxLength={15} />
                  </div>
                  <div className="space-y-1">
                    <Label>Cidade{star(reqCliente.cidade)}</Label>
                    <Input placeholder="São Paulo" value={cidade} onChange={(e) => setCidade(onlyLetters(e.target.value))} />
                  </div>
                  <div className="space-y-1 sm:col-span-1">
                    <Label>Endereço{star(reqCliente.endereco)}</Label>
                    <Input placeholder="Rua, número, bairro" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Observações do pedido</Label>
                  <Textarea rows={2} placeholder="Ex: cor preferida, ponto de referência..." value={obs} onChange={(e) => setObs(e.target.value)} />
                </div>

                <Separator />
                <div className="space-y-1">
                  {cart.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{item.produtoNome}{usarTamanhos ? ` (${item.tamanho})` : ''} ×{item.quantidade}</span>
                      <span>{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-base pt-1"><span>Total</span><span>{formatCurrency(cartTotal)}</span></div>
                </div>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => { setCheckoutOpen(false); setCartOpen(true) }}><ArrowLeft className="h-4 w-4 mr-1.5" />Voltar</Button>
                <Button onClick={confirmarPedido} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar pedido</Button>
              </DialogFooter>
            </>
          ) : (
            <div className="text-center space-y-4 py-2">
              <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
              <div>
                <h2 className="text-xl font-bold">Pedido enviado!</h2>
                <p className="text-sm text-muted-foreground mt-1">A loja já recebeu seu pedido. Toque abaixo para enviar o resumo também pelo WhatsApp e combinar o pagamento e a entrega.</p>
              </div>
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white" size="lg"
                onClick={() => window.open(buildWhatsAppUrl(loja.telefoneVendedor, mensagemWhatsApp()), '_blank')}
                disabled={!loja.telefoneVendedor}>
                <ShoppingBag className="h-5 w-5 mr-2" />Enviar resumo no WhatsApp
              </Button>
              <Button variant="outline" className="w-full" onClick={() => { setCheckoutOpen(false); setEtapa('cadastro'); setNome(''); setCpfCnpj(''); setTelefone(''); setCidade(''); setEndereco(''); setObs('') }}>
                Fazer outro pedido
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
