import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/shared/theme-provider'
import { AuthProvider } from '@/components/shared/auth-provider'
import { QueryProvider } from '@/components/shared/query-provider'
import { ErrorBoundary } from '@/components/shared/error-boundary'
import { Toaster } from '@/components/ui/sonner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Minha Loja',
  description: 'Sistema de gestão para vendedor autônomo de roupas',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Gestão de Roupas',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  openGraph: {
    title: 'Stok Master - Controle sua Loja',
    description: 'Sistema completo e gratuito para gestão de estoque, vendas e clientes.',
    url: 'https://stokmaster.vercel.app', // Substitua pelo seu domínio final depois
    siteName: 'Stok Master',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=1200&h=630', // Imagem bonita genérica de loja para o link
        width: 1200,
        height: 630,
        alt: 'Capa do Sistema Stok Master',
      },
    ],
    locale: 'pt_BR',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <QueryProvider>
            <AuthProvider>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
              <Toaster richColors position="top-right" />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
