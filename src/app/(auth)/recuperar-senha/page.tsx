'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Loader2, KeyRound, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

const resetSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

type ResetForm = z.infer<typeof resetSchema>

export default function RecuperarSenhaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
  })

  async function onSubmit(data: ResetForm) {
    setLoading(true)
    try {
      // Enviar o e-mail de recuperação de senha direto pelo Supabase
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/atualizar-senha`,
      })

      if (error) {
        console.error('Reset error:', error)
        toast.error(`Erro: ${error.message}`)
        return
      }
      
      setSentEmail(data.email)
      setSent(true)
      toast.success('Link de recuperação enviado!')
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="bg-primary rounded-full p-3">
              <KeyRound className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Recuperar Senha</CardTitle>
          <CardDescription>
            {sent 
              ? 'Verifique a caixa de entrada do seu e-mail.' 
              : 'Digite o e-mail cadastrado na sua conta para redefinir a senha.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 p-4 rounded-lg text-sm">
                Enviamos um link seguro de recuperação para o e-mail:<br/>
                <strong>{sentEmail}</strong>
              </div>
              <p className="text-xs text-muted-foreground">Não se esqueça de checar a caixa de Spam (Lixo Eletrônico).</p>
              <Button className="w-full mt-4" onClick={() => router.push('/login')}>
                Voltar para o Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  disabled={loading}
                  {...register('email')}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
              
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</> : 'Enviar link de recuperação'}
              </Button>
            </form>
          )}
        </CardContent>
        
        {!sent && (
          <CardFooter className="flex justify-center border-t p-4">
            <Link href="/login" className="flex items-center text-sm text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para o Login
            </Link>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
