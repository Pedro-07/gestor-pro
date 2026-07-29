// Orquestra a captura de TODAS as seções (desktop + mobile) numa única sessão
// de navegador (login uma vez). Resiliente: se uma seção falhar, segue as outras.
// Uso: node capture/record-all.mjs [id1 id2 ...] [--desktop] [--mobile]
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { VIDEO_DIR, ACCOUNT_FILE } from './env.mjs'
import { login, recordFlow } from './runner.mjs'
import { FLOWS } from './flows.mjs'

const BASE = process.env.VIDEO_BASE_URL || 'http://localhost:3000'
const PUBLIC = join(VIDEO_DIR, 'public')
if (!existsSync(ACCOUNT_FILE)) { console.error('Rode `npm run seed` primeiro.'); process.exit(1) }
const acc = JSON.parse(readFileSync(ACCOUNT_FILE, 'utf8'))

const args = process.argv.slice(2)
const ids = args.filter((a) => !a.startsWith('--'))
const onlyDesktop = args.includes('--desktop')
const onlyMobile = args.includes('--mobile')
const modes = onlyDesktop ? [false] : onlyMobile ? [true] : [false, true]
const flows = ids.length ? FLOWS.filter((f) => ids.includes(f.id)) : FLOWS

const browser = await chromium.launch()
console.log('Login...')
const storageState = await login(browser, BASE, acc)

for (const flow of flows) {
  for (const mobile of modes) {
    console.log(`Gravando ${flow.id}${mobile ? ' (mobile)' : ''}...`)
    try {
      await recordFlow({ browser, base: BASE, storageState, flow, mobile, publicDir: PUBLIC })
    } catch (e) {
      console.error(`  ✗ ${flow.id}${mobile ? '-mobile' : ''}: ${e.message.split('\n')[0]}`)
    }
  }
}
await browser.close()
console.log('Captura concluída.')
process.exit(0)
