'use client'

// Página de DIAGNÓSTICO das fotos (temporária). URL nova → imune a cache.
// Abra no iPhone que falha (Modo de Baixo Consumo, pelo WhatsApp) e veja
// QUAIS blocos mostram foto e quais ficam brancos. Isso isola a causa:
//  A branco / B,C ok  → gatilho de composição (transform/backdrop/aspect-ratio)
//  A,B,D branco / C ok → otimizador /_next/image da Vercel
//  TODOS brancos       → carregamento/decodificação (rede/memória no iOS)
//  TODOS ok            → era cache do bundle antigo no catálogo
import Image from 'next/image'

const BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || '') + '/storage/v1/object/public/fotos/produtos/'
const FILES = ['1794512046656.jpeg', '1794498846038.jpeg', '1794498695382.jpeg']
const urls = FILES.map((f) => BASE + f)

function Bloco({ letra, titulo, children }: { letra: string; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold">BLOCO {letra}</h2>
      <p className="text-xs text-muted-foreground -mt-1">{titulo}</p>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </section>
  )
}

export default function DiagFotos() {
  return (
    <div className="min-h-screen bg-background p-4 max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-bold">Diagnóstico de fotos</h1>
        <p className="text-sm text-muted-foreground">Me diga quais BLOCOS (A/B/C/D) mostram as fotos e quais ficam brancos.</p>
      </div>

      {/* A — reproduz o card do catálogo: next/image otimizado + transform + backdrop + aspect-ratio */}
      <Bloco letra="A" titulo="Como era o catálogo (otimizado + transform + aspect-ratio)">
        {urls.map((u, i) => (
          <div key={i} className="aspect-square relative overflow-hidden rounded-lg bg-muted">
            <Image src={u} alt={`A${i}`} fill sizes="128px" loading="eager"
              className="object-cover transition-transform" />
            <span className="absolute top-1 left-1 rounded bg-black/55 text-white text-[9px] px-1 backdrop-blur-sm">P·M·G</span>
          </div>
        ))}
      </Bloco>

      {/* B — next/image otimizado, SEM transform/backdrop, altura fixa (sem aspect-ratio) */}
      <Bloco letra="B" titulo="Otimizado, simples (sem transform, altura fixa)">
        {urls.map((u, i) => (
          <div key={i} className="relative h-24 w-full overflow-hidden rounded-lg bg-muted">
            <Image src={u} alt={`B${i}`} fill sizes="128px" loading="eager" className="object-cover" />
          </div>
        ))}
      </Bloco>

      {/* C — <img> PURO, direto do CDN do Supabase (sem otimizador da Vercel) */}
      <Bloco letra="C" titulo="Imagem direta do Supabase (sem otimizador)">
        {urls.map((u, i) => (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img key={i} src={u} alt={`C${i}`} loading="eager" decoding="async"
            className="h-24 w-full object-cover rounded-lg bg-muted" />
        ))}
      </Bloco>

      {/* D — next/image unoptimized (passa pelo componente, mas serve o original) */}
      <Bloco letra="D" titulo="next/image unoptimized (original via componente)">
        {urls.map((u, i) => (
          <div key={i} className="relative h-24 w-full overflow-hidden rounded-lg bg-muted">
            <Image src={u} alt={`D${i}`} fill sizes="128px" loading="eager" unoptimized className="object-cover" />
          </div>
        ))}
      </Bloco>

      <p className="text-xs text-muted-foreground pt-4 border-t">
        Teste com o Modo de Baixo Consumo LIGADO, abrindo pelo WhatsApp, como um cliente faria.
      </p>
    </div>
  )
}
