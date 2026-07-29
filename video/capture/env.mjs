import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const VIDEO_DIR = join(__dirname, '..')
export const APP_ENV = join(VIDEO_DIR, '..', '.env.local')
export const ACCOUNT_FILE = join(VIDEO_DIR, '.demo-account.json')

// Lê o .env.local do app (URL + anon key do Supabase)
export function loadEnv() {
  const env = Object.fromEntries(
    readFileSync(APP_ENV, 'utf8')
      .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
  )
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
}

// Node 20 não tem WebSocket nativo; supabase-js inicializa realtime no construtor.
export async function makeSupabase() {
  globalThis.WebSocket = globalThis.WebSocket || class WebSocketStub {}
  const { createClient } = await import('@supabase/supabase-js')
  const { url, key } = loadEnv()
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
