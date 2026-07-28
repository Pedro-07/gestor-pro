'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchProdutos, fetchFornecedores, insertProduto, updateProduto, deleteProduto, uploadFile, fetchVendas, fetchMovimentacoesByProduto, insertMovimentacao } from '@/lib/database'
import type { Produto, CategoriaProduto, Fornecedor, Tamanho } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useForm, Controller, type Resolver } from 'react-hook-form'
import { useAppConfig } from '@/hooks/useAppConfig'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Combobox } from '@/components/shared/combobox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Search, MoreVertical, Pencil, Trash2, Package, UploadCloud, Loader2, Image as ImageIcon, History, TrendingUp, Info, ArrowUpRight } from 'lucide-react'
import Image from 'next/image'
import { BarcodeScanner } from '@/components/shared/barcode-scanner'

const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG'] as const

const produtoSchema = z.object({
  codigo: z.string().min(1, 'Código obrigatório'),
  nome: z.string().min(2, 'Nome obrigatório'),
  descricao: z.string().optional(),
  categoria: z.enum(['camiseta', 'calca', 'vestido', 'saia', 'blusa', 'short', 'jaqueta', 'conjunto', 'outro']),
  precoCusto: z.coerce.number().min(0, 'Valor inválido'),
  precoVenda: z.coerce.number().min(0, 'Valor inválido'),
  estoque: z.object({
    PP: z.coerce.number().min(0).default(0),
    P: z.coerce.number().min(0).default(0),
    M: z.coerce.number().min(0).default(0),
    G: z.coerce.number().min(0).default(0),
    GG: z.coerce.number().min(0).default(0),
    XGG: z.coerce.number().min(0).default(0),
  }),
  codigoBarras: z.string().optional(),
})

type ProdutoForm = z.infer<typeof produtoSchema>

export default function EstoquePage() {
  const { usarTamanhos } = useAppConfig()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [categoriaFilter, setCategoriaFilter] = useState('todas')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<Produto | null>(null)
  const [selectedFornecedorId, setSelectedFornecedorId] = useState<string>('')
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [selectedProdutoDetails, setSelectedProdutoDetails] = useState<Produto | null>(null)
  const [detalhesDialogOpen, setDetalhesDialogOpen] = useState(false)
  // Reconhecimento de código de barras já cadastrado (entrada rápida de estoque)
  const [codigoExistente, setCodigoExistente] = useState<Produto | null>(null)
  const [entradaTamanho, setEntradaTamanho] = useState<Tamanho>('M')
  const [entradaQtdStr, setEntradaQtdStr] = useState('1')
  const [modoEntrada, setModoEntrada] = useState<'somar' | 'definir'>('somar')
  const [savingEntrada, setSavingEntrada] = useState(false)

  const { data: produtos = [], isLoading } = useQuery({ queryKey: ['produtos'], queryFn: fetchProdutos })
  const { data: fornecedores = [] } = useQuery<Fornecedor[]>({ queryKey: ['fornecedores'], queryFn: fetchFornecedores })
  const { data: vendas = [] } = useQuery({ queryKey: ['vendas'], queryFn: fetchVendas })
  const { data: movimentacoes = [], isLoading: isLoadingMovs } = useQuery({
    queryKey: ['movimentacoes', selectedProdutoDetails?.id],
    queryFn: () => selectedProdutoDetails ? fetchMovimentacoesByProduto(selectedProdutoDetails.id) : Promise.resolve([]),
    enabled: !!selectedProdutoDetails?.id
  })

  const filtered = produtos.filter((p) => {
    const matchSearch =
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      p.codigo?.toLowerCase().includes(search.toLowerCase()) ||
      p.codigoBarras?.includes(search)
    const matchCategoria = categoriaFilter === 'todas' || p.categoria === categoriaFilter
    return matchSearch && matchCategoria
  })

  const { register, handleSubmit, reset, setValue, control, formState: { errors } } = useForm<ProdutoForm>({
    resolver: zodResolver(produtoSchema) as unknown as Resolver<ProdutoForm>,
    defaultValues: { categoria: 'outro', estoque: { PP: 0, P: 0, M: 0, G: 0, GG: 0, XGG: 0 } },
  })

  function generateCodigo() {
    return 'PRD' + Math.floor(1000 + Math.random() * 9000)
  }

  function openNew() {
    setEditingProduto(null)
    setSelectedFornecedorId('')
    setFotoFile(null)
    setPreviewUrl(null)
    setIsScanning(false)
    reset({
      codigo: generateCodigo(),
      categoria: 'outro',
      estoque: { PP: 0, P: 0, M: 0, G: 0, GG: 0, XGG: 0 },
    })
    setDialogOpen(true)
  }

  function openEdit(p: Produto) {
    setEditingProduto(p)
    setSelectedFornecedorId(p.fornecedorId ?? '')
    setFotoFile(null)
    setPreviewUrl(p.fotoUrl ?? null)
    setIsScanning(false)
    reset({
      codigo: p.codigo, nome: p.nome, descricao: p.descricao, categoria: p.categoria,
      precoCusto: p.precoCusto, precoVenda: p.precoVenda, estoque: p.estoque, codigoBarras: p.codigoBarras,
    })
    setDialogOpen(true)
  }

  async function onSubmit(data: ProdutoForm) {
    setSaving(true)
    try {
      let finalFotoUrl = editingProduto?.fotoUrl

      if (fotoFile) {
        const ext = fotoFile.name.split('.').pop()
        const path = `produtos/${Date.now()}.${ext}`
        finalFotoUrl = await uploadFile(path, fotoFile)
      }

      const f = fornecedores.find((x) => x.id === selectedFornecedorId)

      const estoqueFinal = usarTamanhos ? data.estoque : {
        PP: 0,
        P: 0,
        M: data.estoque.M || 0,
        G: 0,
        GG: 0,
        XGG: 0
      }

      const payload = {
        ...data,
        estoque: estoqueFinal,
        fotoUrl: finalFotoUrl,
        fornecedorId: f?.id ?? undefined,
        fornecedorNome: f?.nome ?? undefined,
      }

      if (editingProduto) {
        await updateProduto(editingProduto.id, payload)
        toast.success('Produto atualizado!')
      } else {
        await insertProduto(payload)
        toast.success('Produto cadastrado!')
      }

      qc.invalidateQueries({ queryKey: ['produtos'] })
      setDialogOpen(false)
    } catch {
      toast.error('Erro ao salvar produto')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: Produto) {
    try {
      await deleteProduto(p.id)
      qc.invalidateQueries({ queryKey: ['produtos'] })
      toast.success('Produto excluído')
      setDeleteDialog(null)
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  // Ao bipar no cadastro: se o código já pertence a um produto, reconhece-o e
  // oferece dar entrada de estoque em vez de criar um duplicado.
  function handleScanCadastro(code: string) {
    setIsScanning(false)
    const existente = produtos.find((p) => p.codigoBarras === code && p.id !== editingProduto?.id)
    if (existente) {
      setEntradaTamanho('M')
      setEntradaQtdStr('1')
      setModoEntrada('somar')
      setCodigoExistente(existente)
      return
    }
    setValue('codigoBarras', code)
    toast.success('Código lido!')
  }

  async function confirmarEntradaEstoque() {
    if (!codigoExistente) return
    const qtd = Math.max(0, Math.floor(Number(entradaQtdStr) || 0))
    if (modoEntrada === 'somar' && qtd < 1) { toast.error('Informe a quantidade a adicionar'); return }
    const tam: Tamanho = usarTamanhos ? entradaTamanho : 'M'
    // valor atual daquele tamanho (ou total, quando a loja não usa tamanhos)
    const atualTam = usarTamanhos
      ? (codigoExistente.estoque[tam] ?? 0)
      : Object.values(codigoExistente.estoque).reduce((a, b) => a + b, 0)
    const novoValor = modoEntrada === 'somar' ? atualTam + qtd : qtd
    const delta = novoValor - atualTam

    const novoEstoque = usarTamanhos
      ? { ...codigoExistente.estoque, [tam]: novoValor }
      : { PP: 0, P: 0, M: novoValor, G: 0, GG: 0, XGG: 0 }

    setSavingEntrada(true)
    try {
      await updateProduto(codigoExistente.id, { estoque: novoEstoque })
      if (delta !== 0) {
        await insertMovimentacao({
          produtoId: codigoExistente.id,
          produtoNome: codigoExistente.nome,
          tipo: delta > 0 ? 'entrada' : 'saida',
          tamanho: tam,
          quantidade: Math.abs(delta),
          motivo: modoEntrada === 'somar' ? 'Entrada por leitura de código' : 'Ajuste de estoque (leitura)',
        })
      }
      qc.invalidateQueries({ queryKey: ['produtos'] })
      toast.success(
        modoEntrada === 'somar'
          ? `+${qtd} un. — ${codigoExistente.nome} (total ${novoValor})`
          : `Estoque definido em ${novoValor} — ${codigoExistente.nome}`
      )
      setCodigoExistente(null)
      setDialogOpen(false)
    } catch {
      toast.error('Erro ao atualizar o estoque')
    } finally {
      setSavingEntrada(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, código ou EAN..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            <SelectItem value="camiseta">Camiseta</SelectItem>
            <SelectItem value="calca">Calça</SelectItem>
            <SelectItem value="vestido">Vestido</SelectItem>
            <SelectItem value="saia">Saia</SelectItem>
            <SelectItem value="blusa">Blusa</SelectItem>
            <SelectItem value="short">Short</SelectItem>
            <SelectItem value="jaqueta">Jaqueta</SelectItem>
            <SelectItem value="conjunto">Conjunto</SelectItem>
            <SelectItem value="outro">Outro</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openNew} className="shrink-0"><Plus className="h-4 w-4 mr-2" />Novo Produto</Button>
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length} produto(s) encontrado(s)</p>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><Package className="h-12 w-12 mx-auto mb-3 opacity-20" />Nenhum produto encontrado.</CardContent></Card>
      ) : (
        <>
          {/* ─── MOBILE: Cards compactos ─── */}
          <div className="flex flex-col gap-2 sm:hidden">
            {filtered.map((p) => {
              const totalEstoque = Object.values(p.estoque).reduce((a, b) => a + b, 0)
              return (
                <div key={p.id} className="flex items-center gap-3 border rounded-xl px-3 py-2.5 bg-card shadow-sm">
                  {/* Ícone ou inicial */}
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-muted flex items-center justify-center overflow-hidden border">
                    {p.fotoUrl
                      ? <Image src={p.fotoUrl} alt={p.nome} width={40} height={40} className="object-cover w-full h-full" />
                      : <span className="text-base font-bold text-muted-foreground">{p.nome.charAt(0).toUpperCase()}</span>
                    }
                  </div>

                  {/* Infos centrais */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{p.nome}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">{p.codigo}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">{p.categoria}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-bold text-green-600 dark:text-green-400">{formatCurrency(p.precoVenda)}</span>
                      <Badge variant={totalEstoque === 0 ? 'destructive' : totalEstoque < 5 ? 'outline' : 'default'} className="text-[9px] px-1.5 py-0.5 leading-none">
                        {usarTamanhos ? `${totalEstoque} un` : `${totalEstoque} un`}
                      </Badge>
                    </div>
                  </div>

                  {/* Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent bg-transparent text-sm transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={4}>
                      <DropdownMenuItem onClick={() => { setSelectedProdutoDetails(p); setDetalhesDialogOpen(true) }}>
                        <Info className="mr-2 h-4 w-4 text-primary" />Mais Informações
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(p)}>
                        <Pencil className="mr-2 h-4 w-4" />Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteDialog(p)}>
                        <Trash2 className="mr-2 h-4 w-4" />Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </div>

          {/* ─── DESKTOP: Tabela compacta ─── */}
          <div className="hidden sm:block rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-[110px]">Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="hidden md:table-cell">Categoria</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Custo</TableHead>
                    <TableHead className="text-right">Venda</TableHead>
                    <TableHead className={usarTamanhos ? 'text-center' : 'text-right'}>Estoque</TableHead>
                    <TableHead className="w-[60px] text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const totalEstoque = Object.values(p.estoque).reduce((a, b) => a + b, 0)
                    return (
                      <TableRow key={p.id} className="hover:bg-muted/20 group">
                        <TableCell className="font-mono text-xs font-semibold text-muted-foreground">
                          {p.codigo}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm leading-none">{p.nome}</div>
                          {p.codigoBarras && <span className="text-[10px] text-muted-foreground font-mono">EAN: {p.codigoBarras}</span>}
                        </TableCell>
                        <TableCell className="capitalize text-xs text-muted-foreground hidden md:table-cell">
                          {p.categoria}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground font-mono hidden lg:table-cell">
                          {formatCurrency(p.precoCusto)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-sm text-green-600 dark:text-green-400 font-mono">
                          {formatCurrency(p.precoVenda)}
                        </TableCell>
                        <TableCell className={usarTamanhos ? 'text-center' : 'text-right'}>
                          {usarTamanhos ? (
                            <div className="flex items-center justify-center gap-1 flex-wrap max-w-[180px] mx-auto">
                              {(['PP', 'P', 'M', 'G', 'GG', 'XGG'] as const).map((t) => {
                                const q = p.estoque[t] ?? 0
                                if (q === 0) return null
                                return (
                                  <Badge key={t} variant="secondary" className="text-[9px] px-1 py-0.5 leading-none">
                                    {t}:{q}
                                  </Badge>
                                )
                              })}
                              <Badge variant={totalEstoque === 0 ? 'destructive' : totalEstoque < 5 ? 'outline' : 'default'} className="text-[9px] px-1 py-0.5 leading-none font-bold">
                                ={totalEstoque}
                              </Badge>
                            </div>
                          ) : (
                            <Badge variant={totalEstoque === 0 ? 'destructive' : totalEstoque < 5 ? 'outline' : 'default'} className="text-xs font-semibold">
                              {totalEstoque} un
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center p-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent bg-transparent text-sm transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 opacity-70 group-hover:opacity-100">
                              <MoreVertical className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" sideOffset={4}>
                              <DropdownMenuItem onClick={() => { setSelectedProdutoDetails(p); setDetalhesDialogOpen(true) }}>
                                <Info className="mr-2 h-4 w-4 text-primary" />Mais Informações
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(p)}>
                                <Pencil className="mr-2 h-4 w-4" />Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteDialog(p)}>
                                <Trash2 className="mr-2 h-4 w-4" />Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* Detalhes Dialog */}
      <Dialog open={detalhesDialogOpen} onOpenChange={setDetalhesDialogOpen}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto p-0 gap-0">
          {selectedProdutoDetails && (() => {
            const p = selectedProdutoDetails
            const totalEstoque = Object.values(p.estoque).reduce((a, b) => a + b, 0)
            const lucroVal = p.precoVenda - p.precoCusto
            const margemLucro = p.precoVenda > 0 ? (lucroVal / p.precoVenda) * 100 : 0

            const vendasDoProduto = vendas.filter((v) =>
              v.itens.some((item) => item.produtoId === p.id)
            )

            return (
              <>
                {/* Header do modal */}
                <div className="flex items-center gap-4 px-6 pt-6 pb-4 border-b">
                  {/* Avatar / foto miniatura */}
                  <div className="h-14 w-14 shrink-0 rounded-xl bg-muted border flex items-center justify-center overflow-hidden">
                    {p.fotoUrl
                      ? <Image src={p.fotoUrl} alt={p.nome} width={56} height={56} className="object-cover w-full h-full" />
                      : <Package className="h-7 w-7 text-muted-foreground/50" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="text-xl font-bold truncate">{p.nome}</DialogTitle>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Ref: {p.codigo}</span>
                      <span className="text-xs text-muted-foreground capitalize">{p.categoria}</span>
                      <Badge variant={totalEstoque === 0 ? 'destructive' : totalEstoque < 5 ? 'outline' : 'default'} className="text-[10px]">
                        {totalEstoque} un. em estoque
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Abas */}
                <Tabs defaultValue="geral" className="flex flex-col">
                  <TabsList className="grid grid-cols-3 w-full rounded-none border-b h-11 bg-transparent px-6 gap-0">
                    <TabsTrigger value="geral" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs gap-1.5">
                      <Info className="h-3.5 w-3.5" />Informações
                    </TabsTrigger>
                    <TabsTrigger value="historico" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs gap-1.5">
                      <History className="h-3.5 w-3.5" />Movimentação
                    </TabsTrigger>
                    <TabsTrigger value="vendas" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5" />Vendas ({vendasDoProduto.length})
                    </TabsTrigger>
                  </TabsList>

                  {/* ABA INFORMAÇÕES */}
                  <TabsContent value="geral" className="m-0">
                    <div className="px-6 py-5 space-y-5">

                      {/* KPIs — Custo / Venda / Margem / Lucro */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-xl border bg-card px-2 py-2.5 text-center">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Custo</p>
                          <p className="text-xs md:text-sm font-bold font-mono mt-1 whitespace-nowrap">{formatCurrency(p.precoCusto)}</p>
                        </div>
                        <div className="rounded-xl border bg-card px-2 py-2.5 text-center">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Venda</p>
                          <p className="text-xs md:text-sm font-bold font-mono mt-1 text-green-600 dark:text-green-400 whitespace-nowrap">{formatCurrency(p.precoVenda)}</p>
                        </div>
                        <div className="rounded-xl border bg-card px-2 py-2.5 text-center">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Lucro</p>
                          <p className="text-xs md:text-sm font-bold font-mono mt-1 text-blue-600 dark:text-blue-400 whitespace-nowrap">{formatCurrency(lucroVal)}</p>
                        </div>
                        <div className="rounded-xl border bg-card px-2 py-2.5 text-center">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Margem</p>
                          <p className="text-xs md:text-sm font-bold font-mono mt-1 text-purple-600 dark:text-purple-400 whitespace-nowrap">{margemLucro.toFixed(1)}%</p>
                        </div>
                      </div>

                      {/* Detalhes do produto */}
                      <div className="rounded-xl border bg-card divide-y">
                        <div className="grid grid-cols-2 divide-x">
                          <div className="px-4 py-3">
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide mb-1">Código de Barras (EAN)</p>
                            <p className="text-sm font-mono font-medium">{p.codigoBarras || '—'}</p>
                          </div>
                          <div className="px-4 py-3">
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide mb-1">Fornecedor</p>
                            <p className="text-sm font-medium truncate">{p.fornecedorNome || '—'}</p>
                          </div>
                        </div>
                        {p.descricao && (
                          <div className="px-4 py-3">
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide mb-1">Descrição</p>
                            <p className="text-sm leading-relaxed text-foreground/80">{p.descricao}</p>
                          </div>
                        )}
                      </div>

                      {/* Estoque por tamanho */}
                      {usarTamanhos && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Grade de Estoque</p>
                          <div className="grid grid-cols-6 gap-2">
                            {(['PP', 'P', 'M', 'G', 'GG', 'XGG'] as const).map((t) => {
                              const q = p.estoque[t] ?? 0
                              return (
                                <div key={t} className={`rounded-xl border text-center py-3 ${q === 0 ? 'opacity-40 bg-muted/30' : 'bg-card'}`}>
                                  <p className="text-[10px] font-bold text-muted-foreground">{t}</p>
                                  <p className={`text-lg font-bold mt-0.5 ${q === 0 ? 'text-muted-foreground' : 'text-foreground'}`}>{q}</p>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Foto grande (se houver) */}
                      {p.fotoUrl && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Foto do Produto</p>
                          <div className="relative w-full h-48 rounded-xl border overflow-hidden bg-muted/20">
                            <Image src={p.fotoUrl} alt={p.nome} fill className="object-contain" />
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end pt-1">
                        <Button variant="outline" size="sm" onClick={() => { setDetalhesDialogOpen(false); openEdit(p) }}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />Editar Produto
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  {/* ABA MOVIMENTAÇÕES */}
                  <TabsContent value="historico" className="m-0">
                    <div className="px-6 py-5">
                      {isLoadingMovs ? (
                        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
                      ) : movimentacoes.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <History className="h-10 w-10 mx-auto mb-2 opacity-20" />
                          <p className="text-sm">Nenhuma movimentação registrada.</p>
                        </div>
                      ) : (
                        <div className="rounded-xl border overflow-hidden">
                          <div className="max-h-[340px] overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/40">
                                  <TableHead className="text-xs">Data</TableHead>
                                  <TableHead className="text-xs text-center">Tipo</TableHead>
                                  {usarTamanhos && <TableHead className="text-xs text-center">Tam.</TableHead>}
                                  <TableHead className="text-xs text-right">Qtd</TableHead>
                                  <TableHead className="text-xs">Motivo</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {movimentacoes.map((m) => (
                                  <TableRow key={m.id} className="text-xs">
                                    <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                                      {formatDate(new Date(m.createdAt))}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Badge variant={m.tipo === 'entrada' ? 'default' : 'destructive'} className="text-[9px] px-1.5 py-0.5">
                                        {m.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                                      </Badge>
                                    </TableCell>
                                    {usarTamanhos && (
                                      <TableCell className="text-center font-bold text-muted-foreground">{m.tamanho}</TableCell>
                                    )}
                                    <TableCell className={`text-right font-mono font-bold ${m.tipo === 'entrada' ? 'text-green-600' : 'text-red-500'}`}>
                                      {m.tipo === 'entrada' ? '+' : '-'}{m.quantidade}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground max-w-[180px] truncate" title={m.motivo}>
                                      {m.motivo}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* ABA VENDAS */}
                  <TabsContent value="vendas" className="m-0">
                    <div className="px-6 py-5">
                      {vendasDoProduto.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-20" />
                          <p className="text-sm">Nenhuma venda registrada para este produto.</p>
                        </div>
                      ) : (
                        <div className="rounded-xl border overflow-hidden">
                          <div className="max-h-[340px] overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/40">
                                  <TableHead className="text-xs">Data</TableHead>
                                  <TableHead className="text-xs">Cliente</TableHead>
                                  {usarTamanhos && <TableHead className="text-xs text-center">Tam.</TableHead>}
                                  <TableHead className="text-xs text-right">Qtd</TableHead>
                                  <TableHead className="text-xs text-right">Un.</TableHead>
                                  <TableHead className="text-xs text-right">Total</TableHead>
                                  <TableHead className="w-[40px]"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {vendasDoProduto.map((v) => {
                                  const item = v.itens.find((i) => i.produtoId === p.id)
                                  if (!item) return null
                                  return (
                                    <TableRow key={v.id} className="text-xs hover:bg-muted/10">
                                      <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                                        {formatDate(new Date(v.createdAt))}
                                      </TableCell>
                                      <TableCell className="font-medium truncate max-w-[120px]" title={v.clienteNome}>
                                        {v.clienteNome}
                                      </TableCell>
                                      {usarTamanhos && (
                                        <TableCell className="text-center text-muted-foreground">{item.tamanho}</TableCell>
                                      )}
                                      <TableCell className="text-right font-semibold font-mono">{item.quantidade}</TableCell>
                                      <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(item.precoUnitario)}</TableCell>
                                      <TableCell className="text-right font-mono font-bold text-green-600 dark:text-green-400">{formatCurrency(item.subtotal)}</TableCell>
                                      <TableCell className="text-center p-1">
                                        <a href={`/vendas/${v.id}`} target="_blank" rel="noopener noreferrer"
                                          className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-muted text-primary" title="Ver venda">
                                          <ArrowUpRight className="h-3.5 w-3.5" />
                                        </a>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Footer */}
                <div className="flex justify-end px-6 py-4 border-t bg-muted/20">
                  <Button variant="outline" size="sm" onClick={() => setDetalhesDialogOpen(false)}>Fechar</Button>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>


      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingProduto ? 'Editar Produto' : 'Novo Produto'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit as Parameters<typeof handleSubmit>[0])} className="space-y-6">
            {/* Imagem */}
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 bg-muted border-2 border-dashed rounded-lg flex items-center justify-center overflow-hidden relative shrink-0">
                {previewUrl ? (
                  <Image src={previewUrl} alt="Preview" fill className="object-cover" />
                ) : (
                  <UploadCloud className="h-6 w-6 text-muted-foreground opacity-50" />
                )}
                <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) { setFotoFile(file); setPreviewUrl(URL.createObjectURL(file)) }
                  }} />
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Foto do Produto</p>
                <p className="text-xs">Clique na caixa para selecionar uma imagem (JPG, PNG)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Código *</Label><Input {...register('codigo')} /><p className="text-[10px] text-muted-foreground">Use a sigla da loja + sequencial (ex: LJ001)</p></div>
              <div className="space-y-1">
                <Label>Código de Barras (EAN)</Label>
                <div className="flex gap-2">
                  <Input {...register('codigoBarras')} placeholder="Deixe em branco p/ gerar auto" />
                  <Button type="button" variant="outline" size="icon" onClick={() => setIsScanning(!isScanning)}>
                    <Package className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {isScanning && (
                <div className="sm:col-span-2 border p-2 rounded-lg bg-black/5">
                  <BarcodeScanner compact onDetected={handleScanCadastro} />
                </div>
              )}
              <div className="space-y-1 sm:col-span-2"><Label>Nome do Produto *</Label><Input {...register('nome')} placeholder="Ex: Camiseta Básica Algodão" />{errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}</div>
              <div className="space-y-1">
                <Label>Categoria *</Label>
                <Controller name="categoria" control={control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="camiseta">Camiseta</SelectItem>
                      <SelectItem value="calca">Calça</SelectItem>
                      <SelectItem value="vestido">Vestido</SelectItem>
                      <SelectItem value="saia">Saia</SelectItem>
                      <SelectItem value="blusa">Blusa</SelectItem>
                      <SelectItem value="short">Short</SelectItem>
                      <SelectItem value="jaqueta">Jaqueta</SelectItem>
                      <SelectItem value="conjunto">Conjunto</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1"><Label>Fornecedor</Label><Combobox options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))} value={selectedFornecedorId} onSelect={setSelectedFornecedorId} placeholder="Selecione o fornecedor" searchPlaceholder="Buscar..." emptyMessage="Não encontrado" /></div>
            </div>

            {/* Valores */}
            <Card className="bg-muted/30">
              <CardContent className="py-4 grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Preço de Custo (R$)</Label><Input type="number" step="0.01" min="0" {...register('precoCusto')} /></div>
                <div className="space-y-1"><Label>Preço de Venda (R$)</Label><Input type="number" step="0.01" min="0" {...register('precoVenda')} /></div>
              </CardContent>
            </Card>

            {/* Estoque */}
            {usarTamanhos ? (
              <div className="space-y-2">
                <Label>Quantidade em Estoque por Tamanho</Label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {TAMANHOS.map((t) => (
                    <div key={t} className="space-y-1 text-center">
                      <Label className="text-xs">{t}</Label>
                      <Input type="number" min="0" className="text-center h-9" {...register(`estoque.${t}`)} onFocus={(e) => e.target.select()} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Quantidade em Estoque</Label>
                <Input type="number" min="0" className="h-9" placeholder="Ex: 10" {...register('estoque.M')} onFocus={(e) => e.target.select()} />
              </div>
            )}

            <div className="space-y-1"><Label>Descrição / Detalhes</Label><Textarea rows={2} {...register('descricao')} /></div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar Produto</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reconhecimento de código já cadastrado — entrada rápida de estoque */}
      <Dialog open={!!codigoExistente} onOpenChange={(v) => { if (!v) setCodigoExistente(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Produto já cadastrado</DialogTitle></DialogHeader>
          {codigoExistente && (() => {
            const qtdNum = Math.max(0, parseInt(entradaQtdStr || '0', 10))
            const tam: Tamanho = usarTamanhos ? entradaTamanho : 'M'
            const atualTam = usarTamanhos
              ? (codigoExistente.estoque[tam] ?? 0)
              : Object.values(codigoExistente.estoque).reduce((a, b) => a + b, 0)
            const resultado = modoEntrada === 'somar' ? atualTam + qtdNum : qtdNum
            return (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
                <div className="h-12 w-12 shrink-0 rounded-lg bg-muted border flex items-center justify-center overflow-hidden">
                  {codigoExistente.fotoUrl
                    ? <Image src={codigoExistente.fotoUrl} alt={codigoExistente.nome} width={48} height={48} className="object-cover w-full h-full" />
                    : <Package className="h-6 w-6 text-muted-foreground/50" />}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{codigoExistente.nome}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">Ref: {codigoExistente.codigo} · EAN: {codigoExistente.codigoBarras}</p>
                  <p className="text-[11px] text-muted-foreground">Em estoque: {Object.values(codigoExistente.estoque).reduce((a, b) => a + b, 0)} un.</p>
                </div>
              </div>

              {/* Somar (padrão) ou Editar/definir a quantidade total */}
              <div className="grid grid-cols-2 gap-1 rounded-lg border p-1 text-xs font-medium">
                <button type="button" onClick={() => setModoEntrada('somar')}
                  className={`rounded-md py-1.5 transition-colors ${modoEntrada === 'somar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  Somar ao estoque
                </button>
                <button type="button" onClick={() => setModoEntrada('definir')}
                  className={`rounded-md py-1.5 transition-colors ${modoEntrada === 'definir' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  Editar quantidade
                </button>
              </div>

              <div className={usarTamanhos ? 'grid grid-cols-2 gap-3' : ''}>
                {usarTamanhos && (
                  <div className="space-y-1">
                    <Label className="text-xs">Tamanho</Label>
                    <Select value={entradaTamanho} onValueChange={(v) => setEntradaTamanho(v as Tamanho)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TAMANHOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">{modoEntrada === 'somar' ? 'Quantidade a adicionar' : 'Nova quantidade total'}</Label>
                  <Input type="text" inputMode="numeric" placeholder="Ex: 20" value={entradaQtdStr}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setEntradaQtdStr(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))} />
                </div>
              </div>

              {/* Preview do resultado */}
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs flex items-center justify-between">
                <span className="text-muted-foreground">Estoque {usarTamanhos ? tam : 'total'}</span>
                <span className="font-mono">
                  <span className="text-foreground font-semibold">{atualTam}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span className="text-green-600 dark:text-green-400 font-bold">{resultado}</span> un.
                </span>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => { setValue('codigoBarras', codigoExistente.codigoBarras ?? ''); setCodigoExistente(null) }}>
                  Só preencher o código
                </Button>
                <Button onClick={confirmarEntradaEstoque} disabled={savingEntrada || (modoEntrada === 'somar' && qtdNum < 1)}>
                  {savingEntrada && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{modoEntrada === 'somar' ? 'Dar entrada' : 'Definir estoque'}
                </Button>
              </DialogFooter>
            </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir produto?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir <strong>{deleteDialog?.nome}</strong>?</p>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancelar</Button><Button variant="destructive" onClick={() => deleteDialog && handleDelete(deleteDialog)}>Excluir</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
