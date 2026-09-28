// ============================================================================
// Script ÚNICO — reprocessa (comprime) as fotos já existentes no Storage.
// Baixa cada imagem, redimensiona (máx 1200px) e converte para WebP, re-sobe,
// atualiza a URL no banco (produtos.fotoUrl / config.logoUrl) e apaga a antiga.
//
// Roda no SEU ambiente com a chave service_role (bypassa RLS). NUNCA comite a key.
//
// Pré-requisitos:
//   npm i -D sharp        (o @supabase/supabase-js já é dependência do projeto)
//
// Uso (dry-run — só mostra o que faria, NÃO grava nada):
//   Bash:        SUPABASE_SERVICE_ROLE_KEY="sua_key" node scripts/reprocessar-fotos.mjs
//   PowerShell:  $env:SUPABASE_SERVICE_ROLE_KEY="sua_key"; node scripts/reprocessar-fotos.mjs
//
// Uso (aplicar de verdade — grava, atualiza o banco e apaga as antigas):
//   Bash:        APPLY=1 SUPABASE_SERVICE_ROLE_KEY="sua_key" node scripts/reprocessar-fotos.mjs
//   PowerShell:  $env:APPLY="1"; $env:SUPABASE_SERVICE_ROLE_KEY="sua_key"; node scripts/reprocessar-fotos.mjs
//
// A URL do Supabase é lida do .env.local (ou de NEXT_PUBLIC_SUPABASE_URL).
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

// ─── Config ──────────────────────────────────────────────────────────────────
const BUCKET = 'fotos'
const MAX_DIM = 1200          // maior lado das fotos de produto
const MAX_DIM_LOGO = 512      // maior lado das logos
const QUALITY = 80            // qualidade WebP
const THRESHOLD = 300 * 1024  // ignora quem já for WebP e menor que isso
const APPLY = process.env.APPLY === '1'

// ─── Lê .env.local só para pegar a URL pública ───────────────────────────────
function loadEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local')
  const env = {}
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  return env
}

const fileEnv = loadEnvLocal()
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltam credenciais.')
  console.error('   Defina SUPABASE_SERVICE_ROLE_KEY no ambiente e garanta NEXT_PUBLIC_SUPABASE_URL (.env.local ou env).')
  process.exit(1)
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ─── Helpers ─────────────────────────────────────────────────────────────────
const kb = (n) => `${(n / 1024).toFixed(0)} KB`

/** Extrai o caminho dentro do bucket a partir da URL pública. Retorna null se não for do nosso bucket. */
function pathFromPublicUrl(url) {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  return decodeURIComponent(url.slice(i + marker.length))
}

const totals = { visto: 0, reprocessado: 0, pulado: 0, erro: 0, antes: 0, depois: 0 }

/**
 * Reprocessa uma única imagem referenciada por uma linha do banco.
 * @param {object} o
 * @param {string} o.label   descrição p/ log (ex.: "produto <id>")
 * @param {string} o.url     URL pública atual
 * @param {number} o.maxDim  maior lado permitido
 * @param {(newUrl:string)=>Promise<void>} o.persistUrl  atualiza a URL no banco
 */
async function reprocessar({ label, url, maxDim, persistUrl }) {
  totals.visto++
  const storagePath = pathFromPublicUrl(url)
  if (!storagePath) { totals.pulado++; console.log(`• ${label}: URL externa/ inesperada, pulando`); return }

  const ext = (storagePath.split('.').pop() || '').toLowerCase()

  // baixa o arquivo atual
  const { data: file, error: dErr } = await supa.storage.from(BUCKET).download(storagePath)
  if (dErr || !file) { totals.erro++; console.log(`✗ ${label}: falha ao baixar (${dErr?.message || 'sem dados'})`); return }
  const buf = Buffer.from(await file.arrayBuffer())
  const origSize = buf.length

  // já é webp e pequeno → não mexe
  if (ext === 'webp' && origSize <= THRESHOLD) {
    totals.pulado++
    console.log(`• ${label}: já otimizado (${kb(origSize)}), pulando`)
    return
  }

  // recomprime (auto-orienta pelo EXIF antes de redimensionar)
  let out
  try {
    out = await sharp(buf)
      .rotate()
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer()
  } catch (e) {
    totals.erro++
    console.log(`✗ ${label}: falha ao processar (${e.message})`)
    return
  }

  if (out.length >= origSize) {
    totals.pulado++
    console.log(`• ${label}: sem ganho (${kb(origSize)} → ${kb(out.length)}), mantendo`)
    return
  }

  const newPath = storagePath.replace(/\.[^.]+$/, '') + '.webp'
  totals.antes += origSize
  totals.depois += out.length
  totals.reprocessado++

  console.log(`${APPLY ? '✔' : '»'} ${label}: ${kb(origSize)} → ${kb(out.length)} (${storagePath}${newPath !== storagePath ? ` → ${newPath}` : ''})`)

  if (!APPLY) return

  // sobe a versão nova
  const { error: uErr } = await supa.storage.from(BUCKET).upload(newPath, out, { contentType: 'image/webp', upsert: true })
  if (uErr) { totals.erro++; console.log(`  ✗ upload falhou: ${uErr.message}`); return }

  // se o caminho mudou (jpg/png → webp), atualiza a URL no banco e apaga o antigo
  if (newPath !== storagePath) {
    const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(newPath)
    try {
      await persistUrl(pub.publicUrl)
    } catch (e) {
      console.log(`  ✗ falha ao atualizar o banco: ${e.message} (novo arquivo mantido em ${newPath})`)
      return
    }
    const { error: rErr } = await supa.storage.from(BUCKET).remove([storagePath])
    if (rErr) console.log(`  ⚠ não consegui apagar o antigo (${storagePath}): ${rErr.message}`)
  }
}

// ─── Execução ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Reprocessar fotos — modo ${APPLY ? 'APLICAR (grava!)' : 'DRY-RUN (simulação)'} ===\n`)

  // Produtos
  const { data: produtos, error: pErr } = await supa
    .from('produtos').select('id, nome, fotoUrl').not('fotoUrl', 'is', null)
  if (pErr) { console.error('Erro ao ler produtos:', pErr.message); process.exit(1) }

  for (const p of produtos ?? []) {
    if (!p.fotoUrl) continue
    await reprocessar({
      label: `produto ${p.nome ?? p.id}`,
      url: p.fotoUrl,
      maxDim: MAX_DIM,
      persistUrl: async (novaUrl) => {
        const { error } = await supa.from('produtos').update({ fotoUrl: novaUrl, updatedAt: new Date().toISOString() }).eq('id', p.id)
        if (error) throw error
      },
    })
  }

  // Logos (config.logoUrl)
  const { data: configs, error: cErr } = await supa
    .from('config').select('loja_id, logoUrl').not('logoUrl', 'is', null)
  if (cErr) { console.log('Aviso: não consegui ler config:', cErr.message) }

  for (const c of configs ?? []) {
    if (!c.logoUrl) continue
    await reprocessar({
      label: `logo (loja ${c.loja_id})`,
      url: c.logoUrl,
      maxDim: MAX_DIM_LOGO,
      persistUrl: async (novaUrl) => {
        const { error } = await supa.from('config').update({ logoUrl: novaUrl }).eq('loja_id', c.loja_id)
        if (error) throw error
      },
    })
  }

  // Resumo
  console.log('\n─── Resumo ───')
  console.log(`Vistas:        ${totals.visto}`)
  console.log(`Reprocessadas: ${totals.reprocessado}`)
  console.log(`Puladas:       ${totals.pulado}`)
  console.log(`Erros:         ${totals.erro}`)
  if (totals.reprocessado) {
    const economia = totals.antes - totals.depois
    console.log(`Tamanho:       ${kb(totals.antes)} → ${kb(totals.depois)}  (economia de ${kb(economia)}, ${((economia / totals.antes) * 100).toFixed(0)}%)`)
  }
  if (!APPLY) console.log('\n(nada foi gravado — rode com APPLY=1 para aplicar)')
  console.log('')
}

main().catch((e) => { console.error(e); process.exit(1) })
