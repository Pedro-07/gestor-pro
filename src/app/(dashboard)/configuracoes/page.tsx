'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchConfig, saveConfig, uploadFile } from '@/lib/database'
import type { Configuracoes } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useForm, Controller } from 'react-hook-form'
import { toast } from 'sonner'
import { Loader2, Save, UploadCloud, Store, Package, Users, ShoppingCart } from 'lucide-react'
import Image from 'next/image'

const defaultTemplates = {
  templateCobranca: 'Olá {nome}! 👋\n\nPassando para lembrar sobre a parcela {numero}/{total} no valor de *{valor}* com vencimento em *{vencimento}*.\n\nPor favor, entre em contato para regularizar. Obrigado!',
  templateInadimplente: 'Olá {nome}. Verificamos que há débitos em aberto referentes às suas compras.\n\nTotal em aberto: *{valor}*.\n\nPor favor, entre em contato urgente para negociação.',
  templateConfirmacaoPagamento: 'Olá {nome}! Recebemos o pagamento da parcela {numero}/{total} no valor de *{valor}*.\n\nObrigado pela preferência! 🎉',
}

export default function ConfiguracoesPage() {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [novoTamanho, setNovoTamanho] = useState('')

  const { data: config, isLoading } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })

  const { register, handleSubmit, reset, watch, setValue, control } = useForm<Configuracoes>({
    defaultValues: { ...defaultTemplates, nomeVendedor: '', telefoneVendedor: '', nomeApp: 'Stok Master', usarTamanhos: true, usarFornecedor: false, usarObservacoes: false, tamanhos: ['PP', 'P', 'M', 'G', 'GG', 'XGG'] },
  })

  useEffect(() => {
    if (config) {
      reset({
        nomeVendedor: config.nomeVendedor ?? '',
        telefoneVendedor: config.telefoneVendedor ?? '',
        nomeApp: config.nomeApp ?? 'Stok Master',
        templateCobranca: config.templateCobranca || defaultTemplates.templateCobranca,
        templateInadimplente: config.templateInadimplente || defaultTemplates.templateInadimplente,
        templateConfirmacaoPagamento: config.templateConfirmacaoPagamento || defaultTemplates.templateConfirmacaoPagamento,
        usarTamanhos: config.usarTamanhos !== false,
        usarFornecedor: config.usarFornecedor === true,
        usarObservacoes: config.usarObservacoes === true,
        tamanhos: config.tamanhos && config.tamanhos.length ? config.tamanhos : ['PP', 'P', 'M', 'G', 'GG', 'XGG'],
      })
      if (config.logoUrl) setPreviewUrl(config.logoUrl)
    }
  }, [config, reset])

  async function onSubmit(data: Configuracoes) {
    setSaving(true)
    try {
      let finalLogoUrl = config?.logoUrl

      if (logoFile) {
        const ext = logoFile.name.split('.').pop()
        const path = `logos/logo_${Date.now()}.${ext}`
        finalLogoUrl = await uploadFile(path, logoFile)
      }

      await saveConfig({ ...data, logoUrl: finalLogoUrl })
      qc.invalidateQueries({ queryKey: ['config'] })
      toast.success('Configurações salvas!')
    } catch {
      toast.error('Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-96 rounded-xl" /></div>

  return (
    <div className="max-w-4xl space-y-4">
      <form onSubmit={handleSubmit(onSubmit)}>
        <Tabs defaultValue="geral" className="flex flex-col">
          <TabsList className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto mb-4">
            <TabsTrigger value="geral"><Store className="h-4 w-4 mr-2 shrink-0" /><span className="truncate">Geral</span></TabsTrigger>
            <TabsTrigger value="estoque"><Package className="h-4 w-4 mr-2 shrink-0" /><span className="truncate">Estoque</span></TabsTrigger>
            <TabsTrigger value="clientes"><Users className="h-4 w-4 mr-2 shrink-0" /><span className="truncate">Clientes</span></TabsTrigger>
            <TabsTrigger value="vendas"><ShoppingCart className="h-4 w-4 mr-2 shrink-0" /><span className="truncate">Vendas</span></TabsTrigger>
          </TabsList>

          {/* ─── GERAL: identidade e dados da loja ─── */}
          <TabsContent value="geral" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Identidade Visual</CardTitle><CardDescription>Logo e nome que aparecerão no sistema.</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                  <div className="w-24 h-24 bg-muted border-2 border-dashed rounded-xl flex items-center justify-center overflow-hidden relative shrink-0">
                    {previewUrl ? <Image src={previewUrl} alt="Logo" fill className="object-contain p-1" /> : <UploadCloud className="h-6 w-6 text-muted-foreground opacity-50" />}
                    <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setLogoFile(file); setPreviewUrl(URL.createObjectURL(file)) } }} />
                  </div>
                  <div className="space-y-1"><Label>Logo da Loja</Label><p className="text-sm text-muted-foreground">Clique no quadrado para alterar. Recomendado formato quadrado ou redondo (PNG/JPG).</p></div>
                </div>
                <div className="space-y-1"><Label>Nome do Aplicativo / Loja</Label><Input {...register('nomeApp')} placeholder="Stok Master" /></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Dados do Vendedor / Loja</CardTitle><CardDescription>Informações usadas para contato interno.</CardDescription></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Nome do Responsável</Label><Input {...register('nomeVendedor')} placeholder="João Silva" /></div>
                <div className="space-y-1"><Label>Telefone (WhatsApp)</Label><Input {...register('telefoneVendedor')} placeholder="(11) 99999-9999" /></div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── ESTOQUE: tamanhos e campos do cadastro ─── */}
          <TabsContent value="estoque" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Grade de tamanhos</CardTitle><CardDescription>Como o estoque é organizado por tamanho.</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                <Controller name="usarTamanhos" control={control} render={({ field }) => (
                  <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
                    <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600 shrink-0" />
                    <div><p className="text-sm font-medium">Usar grade de tamanhos</p><p className="text-xs text-muted-foreground">Se desmarcado, o estoque é único por produto (sem tamanhos).</p></div>
                  </label>
                )} />

                {watch('usarTamanhos') && (
                  <Controller name="tamanhos" control={control} render={({ field }) => {
                    const sizes: string[] = field.value ?? []
                    const setSizes = (s: string[]) => field.onChange(s)
                    const addSize = () => {
                      const v = novoTamanho.trim().toUpperCase()
                      if (v && !sizes.includes(v)) setSizes([...sizes, v])
                      setNovoTamanho('')
                    }
                    return (
                      <div className="space-y-2 rounded-lg border p-3 mt-1">
                        <p className="text-xs text-muted-foreground">Escolha os tamanhos que a sua loja usa (letras ou números). Use um preset ou monte a sua lista.</p>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setSizes(['PP', 'P', 'M', 'G', 'GG', 'XGG'])}>Letras (PP–XGG)</Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setSizes(['36', '38', '40', '42', '44', '46'])}>Números (36–46)</Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setSizes(['34', '36', '38', '40', '42', '44'])}>Calçados (34–44)</Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 min-h-8">
                          {sizes.length === 0 && <span className="text-xs text-muted-foreground">Nenhum tamanho — adicione abaixo.</span>}
                          {sizes.map((t) => (
                            <span key={t} className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs font-semibold">
                              {t}
                              <button type="button" onClick={() => setSizes(sizes.filter((x) => x !== t))} className="text-muted-foreground hover:text-destructive">×</button>
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input value={novoTamanho} onChange={(e) => setNovoTamanho(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSize() } }}
                            placeholder="Ex: XG, 48, 38/40..." className="flex-1 h-9" />
                          <Button type="button" variant="secondary" size="sm" onClick={addSize} disabled={!novoTamanho.trim()}>Adicionar</Button>
                        </div>
                      </div>
                    )
                  }} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Campos do cadastro de produtos</CardTitle><CardDescription>Escolha quais campos opcionais aparecem ao cadastrar/editar um produto.</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                <Controller name="usarFornecedor" control={control} render={({ field }) => (
                  <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
                    <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600 shrink-0" />
                    <div><p className="text-sm font-medium">Mostrar campo &quot;Fornecedor&quot;</p><p className="text-xs text-muted-foreground">Exibe a seleção de fornecedor no cadastro (e o item Fornecedores no menu).</p></div>
                  </label>
                )} />
                <Controller name="usarObservacoes" control={control} render={({ field }) => (
                  <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
                    <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600 shrink-0" />
                    <div><p className="text-sm font-medium">Mostrar campo &quot;Observações&quot;</p><p className="text-xs text-muted-foreground">Exibe o campo de descrição/observações no cadastro de produtos.</p></div>
                  </label>
                )} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── CLIENTES: mensagens enviadas ao cliente ─── */}
          <TabsContent value="clientes" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Mensagens ao cliente (WhatsApp)</CardTitle><CardDescription>Modelos usados na cobrança e nos avisos. Use as variáveis entre chaves para personalizar automaticamente.</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2 text-sm bg-muted p-3 rounded-lg"><p className="font-semibold">Variáveis disponíveis:</p><p className="text-muted-foreground font-mono text-xs">{"{nome}, {valor}, {vencimento}, {numero}, {total}"}</p></div>
                <div className="space-y-1"><Label>Lembrete de Cobrança</Label><Textarea rows={4} {...register('templateCobranca')} className="font-mono text-sm" /></div>
                <div className="space-y-1"><Label>Mensagem de Inadimplência</Label><Textarea rows={4} {...register('templateInadimplente')} className="font-mono text-sm" /></div>
                <div className="space-y-1"><Label>Confirmação de Pagamento</Label><Textarea rows={3} {...register('templateConfirmacaoPagamento')} className="font-mono text-sm" /></div>
                <Button type="button" variant="outline" size="sm" onClick={() => { setValue('templateCobranca', defaultTemplates.templateCobranca); setValue('templateInadimplente', defaultTemplates.templateInadimplente); setValue('templateConfirmacaoPagamento', defaultTemplates.templateConfirmacaoPagamento) }}>Restaurar Padrões</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── VENDAS: reservado para evoluir ─── */}
          <TabsContent value="vendas" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Vendas & PDV</CardTitle><CardDescription>Preferências de vendas e ponto de venda.</CardDescription></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Ainda não há configurações de vendas por aqui. Esta seção está pronta para receber novas opções (ex.: forma de pagamento padrão, desconto máximo, impressão de recibo).</p>
              </CardContent>
            </Card>
          </TabsContent>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar Alterações
            </Button>
          </div>
        </Tabs>
      </form>
    </div>
  )
}
