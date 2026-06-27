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
import { Loader2, StoreIcon } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { maskPhone } from '@/lib/utils'

const cadastroSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 letras'),
  nomeLoja: z.string().min(2, 'Nome da loja obrigatório'),
  telefone: z.string().min(14, 'Telefone incompleto').max(15, 'Telefone inválido'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
})

type CadastroForm = z.infer<typeof cadastroSchema>

export default function CadastroPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<CadastroForm>({
    resolver: zodResolver(cadastroSchema),
  })

  async function onSubmit(data: CadastroForm) {
    setLoading(true)
    try {
      const telefoneNumerico = data.telefone.replace(/\D/g, '')

      // O cadastro real é feito com e-mail, mas guardamos o telefone nos metadados 
      // para o Trigger do banco preencher a tabela "perfis" automaticamente.
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            nome: data.nome,
            nome_loja: data.nomeLoja,
            telefone: telefoneNumerico,
          }
        }
      })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success('Conta criada! Verifique sua caixa de entrada para ativar a conta.')
      router.push('/login')
    } catch {
      toast.error('Erro ao criar conta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-lg my-8">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="bg-primary rounded-full p-3">
              <StoreIcon className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Criar Conta</CardTitle>
          <CardDescription>Cadastre sua loja para começar a usar o sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Seu Nome Completo</Label>
              <Input id="nome" placeholder="João da Silva" disabled={loading} {...register('nome')} />
              {errors.nome && <p className="text-sm text-destructive">{errors.nome.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nomeLoja">Nome da Loja</Label>
              <Input id="nomeLoja" placeholder="Minha Loja de Roupas" disabled={loading} {...register('nomeLoja')} />
              {errors.nomeLoja && <p className="text-sm text-destructive">{errors.nomeLoja.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone / WhatsApp</Label>
              <Input id="telefone" placeholder="(11) 99999-9999" disabled={loading} {...register('telefone')} 
                onChange={(e) => {
                  setValue('telefone', maskPhone(e.target.value))
                }} 
              />
              {errors.telefone && <p className="text-sm text-destructive">{errors.telefone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" placeholder="seu@email.com" disabled={loading} {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" placeholder="••••••••" disabled={loading} {...register('password')} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <Input id="confirmPassword" type="password" placeholder="••••••••" disabled={loading} {...register('confirmPassword')} />
              {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
            </div>
            <Button type="submit" className="w-full mt-2" size="lg" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando conta...</> : 'Cadastrar Loja'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center border-t p-4">
          <p className="text-sm text-muted-foreground">
            Já tem uma conta? <Link href="/login" className="text-primary hover:underline font-semibold">Faça Login</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
