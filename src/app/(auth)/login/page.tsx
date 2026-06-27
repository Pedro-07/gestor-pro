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
import { Loader2, ShirtIcon } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { maskPhone } from '@/lib/utils'

const loginSchema = z.object({
  telefone: z.string().min(14, 'Telefone incompleto').max(15, 'Telefone inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginForm) {
    setLoading(true)
    try {
      const telefoneNumerico = data.telefone.replace(/\D/g, '')

      // 1. O sistema busca de forma pública (via RPC) qual é o e-mail deste telefone
      const { data: emailEncontrado, error: rpcError } = await supabase.rpc('get_email_by_phone', { 
        p_phone: telefoneNumerico 
      })

      if (rpcError || !emailEncontrado) {
        toast.error('Nenhuma conta encontrada com este telefone.')
        setLoading(false)
        return
      }

      // 2. Fazemos o login real no Supabase usando o e-mail oculto descoberto
      const { error } = await supabase.auth.signInWithPassword({
        email: emailEncontrado,
        password: data.password,
      })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast.error('Senha incorreta.')
        } else {
          toast.error('Erro ao fazer login. Tente novamente.')
        }
        return
      }
      
      router.push('/dashboard')
    } catch {
      toast.error('Erro de conexão ao fazer login.')
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
              <ShirtIcon className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Gestão de Roupas</CardTitle>
          <CardDescription>Faça login usando seu número de celular</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="telefone">Número do Celular</Label>
              <Input
                id="telefone"
                type="tel"
                placeholder="(11) 99999-9999"
                disabled={loading}
                {...register('telefone')}
                onChange={(e) => {
                  setValue('telefone', maskPhone(e.target.value))
                }}
              />
              {errors.telefone && <p className="text-sm text-destructive">{errors.telefone.message}</p>}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <Link href="/recuperar-senha" className="text-xs text-primary hover:underline" tabIndex={-1}>
                  Esqueceu a senha?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                disabled={loading}
                {...register('password')}
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando...</> : 'Entrar'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center border-t p-4">
          <p className="text-sm text-muted-foreground">
            Ainda não tem conta? <Link href="/cadastro" className="text-primary hover:underline font-semibold">Cadastre-se</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
