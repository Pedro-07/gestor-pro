// Renderiza (Remotion) todas as composições que já têm vídeo capturado.
// Uso: node capture/render-all.mjs [id ...] [--desktop] [--mobile]
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const VIDEO_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const IDS = ['pdv', 'estoque', 'vendas', 'consignacoes', 'relatorios', 'configuracoes']

const args = process.argv.slice(2)
const only = args.filter((a) => !a.startsWith('--'))
const onlyDesktop = args.includes('--desktop')
const onlyMobile = args.includes('--mobile')
const suffixes = onlyDesktop ? [''] : onlyMobile ? ['-mobile'] : ['', '-mobile']
const ids = only.length ? only : IDS

let done = 0, skipped = 0
for (const id of ids) {
  for (const suf of suffixes) {
    const comp = `${id}${suf}`
    if (!existsSync(join(VIDEO_DIR, 'public', `${comp}.webm`))) { console.log(`skip (sem captura): ${comp}`); skipped++; continue }
    console.log(`Renderizando ${comp}...`)
    execSync(`npx remotion render src/index.ts ${comp} out/${comp}.mp4`, { cwd: VIDEO_DIR, stdio: 'inherit' })
    done++
  }
}
console.log(`\nRender concluído: ${done} vídeo(s), ${skipped} pulado(s). Saída em video/out/`)
