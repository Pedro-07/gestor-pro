'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchProdutos, fetchFornecedores, insertProduto, updateProduto, deleteProduto, uploadFile } from '@/lib/database'
import type { Produto, CategoriaProduto, Fornecedor } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { useForm, Controller, type Resolver } from 'react-hook-form'
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
import { Plus, Search, MoreVertical, Pencil, Trash2, Package, UploadCloud, Loader2, Image as ImageIcon } from 'lucide-react'
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

  const { data: produtos = [], isLoading } = useQuery({ queryKey: ['produtos'], queryFn: fetchProdutos })
  const { data: fornecedores = [] } = useQuery<Fornecedor[]>({ queryKey: ['fornecedores'], queryFn: fetchFornecedores })

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

      const payload = {
        ...data,
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
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><Package className="h-12 w-12 mx-auto mb-3 opacity-20" />Nenhum produto encontrado.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((p) => {
            const totalEstoque = Object.values(p.estoque).reduce((a, b) => a + b, 0)
            return (
              <Card key={p.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex gap-4">
                    <div className="w-20 h-20 bg-muted rounded-md shrink-0 flex items-center justify-center overflow-hidden border">
                      {p.fotoUrl ? (
                        <Image src={p.fotoUrl} alt={p.nome} width={80} height={80} className="object-cover w-full h-full" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground opacity-50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium truncate leading-tight">{p.nome}</p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 -mr-2"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(p)}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteDialog(p)}><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.codigo}</span>
                          <span className="text-xs text-muted-foreground capitalize">{p.categoria}</span>
                        </div>
                        <p className="text-sm font-bold text-green-600 dark:text-green-400 mt-1">{formatCurrency(p.precoVenda)}</p>
                      </div>
                      <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                        <div className="flex gap-1 flex-wrap">
                          {TAMANHOS.map((t) => {
                            const q = p.estoque[t]
                            if (q === 0) return null
                            return <Badge key={t} variant="secondary" className="text-[10px] px-1.5">{t}: {q}</Badge>
                          })}
                        </div>
                        <Badge variant={totalEstoque === 0 ? 'destructive' : totalEstoque < 5 ? 'outline' : 'default'} className="text-[10px]">
                          {totalEstoque} no estoque
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

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
                  <BarcodeScanner compact onDetected={(code) => { setValue('codigoBarras', code); setIsScanning(false); toast.success('Código lido!') }} />
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

            <div className="space-y-1"><Label>Descrição / Detalhes</Label><Textarea rows={2} {...register('descricao')} /></div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar Produto</Button>
            </DialogFooter>
          </form>
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
