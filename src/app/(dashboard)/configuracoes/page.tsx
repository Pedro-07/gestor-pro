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
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Loader2, Save, UploadCloud, MessageSquare, Store } from 'lucide-react'
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

  const { data: config, isLoading } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })

  const { register, handleSubmit, reset, watch, setValue } = useForm<Configuracoes>({
    defaultValues: { ...defaultTemplates, nomeVendedor: '', telefoneVendedor: '', nomeApp: 'Minha Loja' },
  })

  useEffect(() => {
    if (config) {
      reset({
        nomeVendedor: config.nomeVendedor ?? '',
        telefoneVendedor: config.telefoneVendedor ?? '',
        nomeApp: config.nomeApp ?? 'Minha Loja',
        templateCobranca: config.templateCobranca || defaultTemplates.templateCobranca,
        templateInadimplente: config.templateInadimplente || defaultTemplates.templateInadimplente,
        templateConfirmacaoPagamento: config.templateConfirmacaoPagamento || defaultTemplates.templateConfirmacaoPagamento,
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
        <Tabs defaultValue="geral">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <TabsList>
              <TabsTrigger value="geral"><Store className="h-4 w-4 mr-2" />Geral & Loja</TabsTrigger>
              <TabsTrigger value="whatsapp"><MessageSquare className="h-4 w-4 mr-2" />Mensagens WhatsApp</TabsTrigger>
            </TabsList>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar Alterações
            </Button>
          </div>

          <TabsContent value="geral" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Identidade Visual</CardTitle><CardDescription>Logo e nome que aparecerão no sistema.</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 bg-muted border-2 border-dashed rounded-xl flex items-center justify-center overflow-hidden relative shrink-0">
                    {previewUrl ? <Image src={previewUrl} alt="Logo" fill className="object-contain p-1" /> : <UploadCloud className="h-6 w-6 text-muted-foreground opacity-50" />}
                    <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setLogoFile(file); setPreviewUrl(URL.createObjectURL(file)) } }} />
                  </div>
                  <div className="space-y-1"><Label>Logo da Loja</Label><p className="text-sm text-muted-foreground">Clique no quadrado para alterar. Recomendado formato quadrado ou redondo (PNG/JPG).</p></div>
                </div>
                <div className="space-y-1"><Label>Nome do Aplicativo / Loja</Label><Input {...register('nomeApp')} placeholder="Minha Loja" /></div>
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

          <TabsContent value="whatsapp" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Templates de Mensagem</CardTitle><CardDescription>Configure as mensagens enviadas aos clientes. Use as variáveis entre chaves para personalizar automaticamente.</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2 text-sm bg-muted p-3 rounded-lg"><p className="font-semibold">Variáveis disponíveis:</p><p className="text-muted-foreground font-mono text-xs">{"{nome}, {valor}, {vencimento}, {numero}, {total}"}</p></div>
                <div className="space-y-1"><Label>Lembrete de Cobrança</Label><Textarea rows={4} {...register('templateCobranca')} className="font-mono text-sm" /></div>
                <div className="space-y-1"><Label>Mensagem de Inadimplência</Label><Textarea rows={4} {...register('templateInadimplente')} className="font-mono text-sm" /></div>
                <div className="space-y-1"><Label>Confirmação de Pagamento</Label><Textarea rows={3} {...register('templateConfirmacaoPagamento')} className="font-mono text-sm" /></div>
                <Button type="button" variant="outline" size="sm" onClick={() => { setValue('templateCobranca', defaultTemplates.templateCobranca); setValue('templateInadimplente', defaultTemplates.templateInadimplente); setValue('templateConfirmacaoPagamento', defaultTemplates.templateConfirmacaoPagamento) }}>Restaurar Padrões</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </form>
    </div>
  )
}
