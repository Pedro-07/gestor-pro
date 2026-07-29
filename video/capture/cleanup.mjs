// Apaga os dados de demonstração criados pelo seed (o usuário auth fica órfão,
// sem service key para removê-lo — sem impacto na loja real).
import { readFileSync, existsSync } from 'node:fs'
import { makeSupabase, ACCOUNT_FILE } from './env.mjs'

if (!existsSync(ACCOUNT_FILE)) { console.log('Nada para limpar.'); process.exit(0) }
const acc = JSON.parse(readFileSync(ACCOUNT_FILE, 'utf8'))
const sb = await makeSupabase()
const { error } = await sb.auth.signInWithPassword({ email: acc.email, password: acc.password })
if (error) { console.error('Login falhou:', error.message); process.exit(1) }

for (const t of ['consignacao_acertos', 'consignacoes', 'movimentacoes', 'parcelas', 'vendas', 'produtos', 'clientes']) {
  const { error: e } = await sb.from(t).delete().eq('loja_id', acc.lojaId)
  console.log(`${t}: ${e ? 'erro ' + e.message : 'ok'}`)
}
await sb.from('config').delete().eq('loja_id', acc.lojaId)
console.log('Limpeza concluída (conta auth de demo permanece órfã).')
process.exit(0)
