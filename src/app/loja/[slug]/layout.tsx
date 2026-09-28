import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { fetchCatalogoLoja } from '@/lib/database'

// Prévia de link (Open Graph) por loja: ao compartilhar /loja/<slug> no
// WhatsApp/redes, aparece um card com nome, descrição e logo da loja.
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const loja = await fetchCatalogoLoja(params.slug).catch(() => null)

  const h = headers()
  const host = h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const base = host ? `${proto}://${host}` : undefined
  const url = base ? `${base}/loja/${params.slug}` : undefined

  if (!loja) {
    return {
      title: 'Catálogo indisponível',
      description: 'Este catálogo não existe ou está indisponível no momento.',
      robots: { index: false, follow: false },
    }
  }

  const titulo = `${loja.nomeApp} — Catálogo online`
  const descricao = `Confira os produtos da ${loja.nomeApp} e faça seu pedido online.`
  const imagens = loja.logoUrl ? [{ url: loja.logoUrl, alt: loja.nomeApp }] : undefined

  return {
    metadataBase: base ? new URL(base) : undefined,
    title: titulo,
    description: descricao,
    openGraph: {
      title: titulo,
      description: descricao,
      url,
      siteName: loja.nomeApp,
      type: 'website',
      locale: 'pt_BR',
      images: imagens,
    },
    twitter: {
      card: loja.logoUrl ? 'summary_large_image' : 'summary',
      title: titulo,
      description: descricao,
      images: loja.logoUrl ? [loja.logoUrl] : undefined,
    },
  }
}

export default function LojaLayout({ children }: { children: React.ReactNode }) {
  return children
}
