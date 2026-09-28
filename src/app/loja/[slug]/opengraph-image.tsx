import { ImageResponse } from 'next/og'
import { fetchCatalogoLoja } from '@/lib/database'

// Card de prévia (1200x630) gerado dinamicamente com nome + logo da loja.
export const alt = 'Catálogo online'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage({ params }: { params: { slug: string } }) {
  const loja = await fetchCatalogoLoja(params.slug).catch(() => null)
  const nome = loja?.nomeApp ?? 'Catálogo online'
  const logo = loja?.logoUrl ?? null
  const inicial = nome.trim().charAt(0).toUpperCase() || 'L'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: 'white',
          fontFamily: 'sans-serif',
          padding: 64,
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={nome}
            width={240}
            height={240}
            style={{ width: 240, height: 240, borderRadius: 40, objectFit: 'cover', border: '6px solid rgba(255,255,255,0.15)' }}
          />
        ) : (
          <div
            style={{
              width: 240,
              height: 240,
              borderRadius: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.12)',
              fontSize: 120,
              fontWeight: 800,
            }}
          >
            {inicial}
          </div>
        )}

        <div style={{ display: 'flex', fontSize: 68, fontWeight: 800, marginTop: 48, textAlign: 'center', maxWidth: 1000, lineHeight: 1.1 }}>
          {nome}
        </div>
        {loja && (
          <div style={{ display: 'flex', fontSize: 34, opacity: 0.8, marginTop: 12 }}>
            Catálogo online
          </div>
        )}
        <div
          style={{
            display: 'flex',
            marginTop: 40,
            fontSize: 28,
            fontWeight: 600,
            background: 'rgba(255,255,255,0.14)',
            padding: '16px 36px',
            borderRadius: 999,
          }}
        >
          Faça seu pedido pelo link
        </div>
      </div>
    ),
    { ...size },
  )
}
