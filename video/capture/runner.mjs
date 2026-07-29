// Motor genérico de captura: recebe uma "flow" (passos com legenda + ação) e um
// modo (desktop/mobile), dirige o app real e salva <id>[-mobile].webm + chapters.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Indicador de toque (ripple) embutido no vídeo — usado no modo mobile.
function rippleScript() {
  if (window.__pwTap) return
  window.__pwTap = true
  const add = () => {
    if (!document.body) return void setTimeout(add, 30)
    const style = document.createElement('style')
    style.textContent = `.pw-tap{position:fixed;z-index:2147483647;width:74px;height:74px;border-radius:9999px;pointer-events:none;border:4px solid #2563eb;background:rgba(37,99,235,.28);transform:translate(-50%,-50%) scale(.2);animation:pwtap .7s ease-out forwards}@keyframes pwtap{0%{opacity:.95;transform:translate(-50%,-50%) scale(.2)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.5)}}`
    document.head.appendChild(style)
    window.addEventListener('pointerdown', (e) => {
      const d = document.createElement('div'); d.className = 'pw-tap'
      d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'
      document.body.appendChild(d); setTimeout(() => d.remove(), 720)
    }, true)
  }
  add()
}

export async function login(browser, base, acc) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const pg = await ctx.newPage()
  await pg.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await pg.waitForTimeout(2200) // hidratação do React
  await pg.fill('#email', acc.email)
  await pg.fill('#password', acc.password)
  await pg.waitForTimeout(300)
  await pg.getByRole('button', { name: 'Entrar' }).click()
  await pg.waitForURL('**/dashboard', { timeout: 45000 })
  const state = await ctx.storageState()
  await ctx.close()
  return state
}

export async function recordFlow({ browser, base, storageState, flow, mobile, publicDir }) {
  const RAW = join(publicDir, '_raw')
  mkdirSync(RAW, { recursive: true })
  const VW = mobile ? 430 : 1280
  const VH = mobile ? 932 : 720
  const opts = { viewport: { width: VW, height: VH }, storageState, recordVideo: { dir: RAW, size: { width: VW, height: VH } } }
  if (mobile) { opts.deviceScaleFactor = 2; opts.isMobile = true; opts.hasTouch = true }
  const ctx = await browser.newContext(opts)
  if (mobile) await ctx.addInitScript(rippleScript)

  const page = await ctx.newPage()
  const video = page.video()
  const t0 = Date.now()
  const captions = []
  const now = () => Date.now() - t0
  const chapter = (c) => { if (captions.length) captions[captions.length - 1].endMs = now(); captions.push({ caption: c, startMs: now(), endMs: now() }) }
  const type = async (loc, text) => { await loc.click(); await loc.pressSequentially(text, { delay: 80 }) }
  const helpers = { page, type, mobile, base }

  await page.goto(`${base}${flow.path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  for (const step of flow.steps) {
    chapter(step.caption)
    if (step.action) {
      try { await step.action(helpers) }
      catch (e) { console.warn(`    [${flow.id}${mobile ? '-mobile' : ''}] passo falhou: ${e.message.split('\n')[0]}`) }
    }
    await page.waitForTimeout(step.wait ?? 1600)
  }
  if (captions.length) captions[captions.length - 1].endMs = now()
  const videoDurationMs = now() + 300

  await ctx.close()
  const raw = await video.path()
  const suffix = mobile ? '-mobile' : ''
  renameSync(raw, join(publicDir, `${flow.id}${suffix}.webm`))
  writeFileSync(join(publicDir, `chapters-${flow.id}${suffix}.json`), JSON.stringify({ videoDurationMs, captions }, null, 2))
  console.log(`  ✓ ${flow.id}${suffix} (${(videoDurationMs / 1000).toFixed(1)}s)`)
}
