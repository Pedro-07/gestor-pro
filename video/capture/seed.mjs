// Cria uma conta de DEMONSTRAÇÃO isolada e semeia dados para gravar os tutoriais.
// Não toca nos dados reais da loja — é um tenant separado (loja_id próprio).
import { writeFileSync } from 'node:fs'
import { makeSupabase, ACCOUNT_FILE } from './env.mjs'

const sb = await makeSupabase()
const ts = Date.now()
const email = `demo.pdv.${ts}@stokmaster-demo.test`
const password = 'DemoStok1234!'

console.log('Criando conta de demonstração...')
const { data: signup, error: suErr } = await sb.auth.signUp({
  email, password,
  options: { data: { nome: 'Loja Demo', nome_loja: 'Boutique Demo', telefone: `demo-${ts}` } },
})
if (suErr) { console.error('Erro no signup:', suErr.message); process.exit(2) }
if (!signup.session) {
  const { data: si } = await sb.auth.signInWithPassword({ email, password })
  if (!si?.session) { console.error('Sem sessão (confirmação de e-mail ativa).'); process.exit(3) }
}
const { data: u } = await sb.auth.getUser()
console.log('Conta:', u.user.id)

// PDV mais simples para os vídeos: sem grade de tamanhos (estoque por unidade)
await sb.from('config').update({ usarTamanhos: false, usarFornecedor: false, usarObservacoes: false, nomeApp: 'Boutique Demo' }).eq('loja_id', u.user.id)

// Cliente
const { data: cli } = await sb.from('clientes').insert({ nome: 'Maria Oliveira', cidade: 'São Paulo', telefone: '11999990000' }).select('id').single()

// Produtos (estoque em M porque usarTamanhos=false)
const est = (m) => ({ PP: 0, P: 0, M: m, G: 0, GG: 0, XGG: 0 })
await sb.from('produtos').insert([
  { codigo: 'CAM01', nome: 'Camiseta Básica Preta', precoCusto: 18, precoVenda: 49.9, estoque: est(40), codigoBarras: '7891000100101' },
  { codigo: 'CAL02', nome: 'Calça Jeans Slim', precoCusto: 55, precoVenda: 139.9, estoque: est(25), codigoBarras: '7891000100202' },
  { codigo: 'VES03', nome: 'Vestido Floral', precoCusto: 42, precoVenda: 119.9, estoque: est(20), codigoBarras: '7891000100303' },
])

// Uma consignação EM ABERTO (para o tutorial de Consignações)
const { data: cam } = await sb.from('produtos').select('id, nome, precoVenda').eq('codigo', 'CAM01').single()
if (cli && cam) {
  const { error: cErr } = await sb.rpc('criar_consignacao', {
    p_cliente_id: cli.id, p_cliente_nome: 'Maria Oliveira', p_cliente_cidade: 'São Paulo', p_cliente_telefone: '11999990000',
    p_itens: [{ produtoId: cam.id, produtoNome: cam.nome, tamanho: 'M', quantidade: 10, precoUnitario: cam.precoVenda }],
    p_observacoes: 'Consignação de demonstração',
  })
  if (cErr) console.warn('Aviso: consignação não criada:', cErr.message)
}

writeFileSync(ACCOUNT_FILE, JSON.stringify({ email, password, lojaId: u.user.id }, null, 2))
console.log('Dados semeados. Credenciais salvas em video/.demo-account.json')
process.exit(0)
