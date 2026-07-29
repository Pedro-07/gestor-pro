// Definição declarativa de cada tutorial (legendas + ações Playwright).
// Seletores independentes de layout → o mesmo fluxo serve desktop e mobile.

const searchPdv = (page) => page.getByPlaceholder(/Buscar produto/i)

async function finalizarPdv(page) {
  const sticky = page.getByRole('button', { name: 'Finalizar', exact: true })
  if (await sticky.first().isVisible().catch(() => false)) await sticky.first().click()
  else await page.getByRole('button', { name: 'Finalizar Venda' }).click()
}
async function checkout(page) {
  await page.getByRole('button', { name: /Selecione o cliente/ }).click()
  await page.getByPlaceholder('Buscar cliente...').fill('Maria')
  await page.waitForTimeout(500)
  await page.getByText('Maria Oliveira').click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'PIX' }).click()
}

export const FLOWS = [
  {
    id: 'pdv', title: 'PDV', subtitle: 'Registrando uma venda', path: '/vendas/pdv',
    steps: [
      { caption: 'Ponto de Venda: a tela começa limpa — só a busca e o leitor azul.', wait: 2200 },
      { caption: 'Busque o produto pelo nome, código ou EAN.', wait: 1500, action: ({ page, type }) => type(searchPdv(page), 'Camiseta') },
      { caption: 'Toque no botão de carrinho para adicionar ao pedido.', wait: 1500, action: ({ page }) => page.getByTitle('Adicionar ao carrinho').first().click() },
      { caption: 'O item entra no carrinho já com quantidade 1.', wait: 1400, action: ({ page }) => searchPdv(page).fill('') },
      {
        caption: 'Adicione outros produtos do mesmo jeito.', wait: 1400,
        action: async ({ page, type }) => { await type(searchPdv(page), 'Vestido'); await page.waitForTimeout(900); await page.getByTitle('Adicionar ao carrinho').first().click(); await searchPdv(page).fill('') },
      },
      { caption: 'Toque em Finalizar para ir ao checkout.', wait: 1500, action: ({ page }) => finalizarPdv(page) },
      { caption: 'Escolha o cliente e a forma de pagamento.', wait: 1600, action: ({ page }) => checkout(page) },
      { caption: 'Confirme — o estoque baixa automaticamente.', wait: 1600, action: ({ page }) => page.getByRole('button', { name: 'Confirmar Venda' }).click() },
      { caption: 'Pronto! Venda registrada. ✅', wait: 2600 },
    ],
  },
  {
    id: 'estoque', title: 'Estoque', subtitle: 'Cadastrando um produto', path: '/estoque',
    steps: [
      { caption: 'No Estoque você vê todos os produtos e o giro de cada um.', wait: 2200 },
      { caption: 'Toque em Novo Produto para cadastrar.', wait: 1400, action: ({ page }) => page.getByRole('button', { name: 'Novo Produto' }).click() },
      { caption: 'Dê um nome ao produto (o código é gerado sozinho).', wait: 1500, action: ({ page, type }) => type(page.getByPlaceholder('Ex: Camiseta Básica Algodão'), 'Blusa de Linho') },
      { caption: 'Informe o preço de custo e o de venda.', wait: 1400, action: async ({ page }) => { await page.locator('input[type="number"]').nth(0).fill('30'); await page.locator('input[type="number"]').nth(1).fill('89.90') } },
      { caption: 'Defina a quantidade em estoque.', wait: 1400, action: ({ page }) => page.locator('input[type="number"]').nth(2).fill('12') },
      { caption: 'Toque em Salvar Produto.', wait: 1800, action: ({ page }) => page.getByRole('button', { name: 'Salvar Produto' }).click() },
      { caption: 'Pronto! Produto cadastrado no estoque. ✅', wait: 2400 },
    ],
  },
  {
    id: 'vendas', title: 'Vendas', subtitle: 'Consultando suas vendas', path: '/vendas',
    steps: [
      { caption: 'Aqui ficam todas as suas vendas registradas.', wait: 2200 },
      { caption: 'Filtre rapidamente por cliente.', wait: 1600, action: ({ page, type }) => type(page.getByPlaceholder('Buscar por cliente...'), 'Maria') },
      { caption: 'Abra uma venda para ver os detalhes.', wait: 1800, action: async ({ page }) => { await page.locator('div.space-y-2').getByRole('button').first().click(); await page.getByText('Ver Detalhes').click(); await page.waitForURL('**/vendas/**') } },
      { caption: 'Veja itens, valores e forma de pagamento — e edite ou cancele se precisar.', wait: 2800 },
    ],
  },
  {
    id: 'consignacoes', title: 'Consignações', subtitle: 'Acerto de contas', path: '/consignacoes',
    steps: [
      { caption: 'Consignações: peças que você entregou a um lojista.', wait: 2200 },
      { caption: 'Cada card mostra vendidas, devolvidas e o que está pendente.', wait: 2200 },
      { caption: 'Toque em Acertar contas para prestar contas.', wait: 1500, action: ({ page }) => page.getByRole('button', { name: /Acertar contas/ }).first().click() },
      { caption: 'Informe quantas peças o lojista vendeu.', wait: 1600, action: ({ page }) => page.locator('input[type="number"]').first().fill('3') },
      { caption: 'Confira o valor a receber e registre o acerto.', wait: 1800, action: ({ page }) => page.getByRole('button', { name: 'Registrar acerto' }).click() },
      { caption: 'Acerto feito — o recebido entra nos relatórios. ✅', wait: 2400 },
    ],
  },
  {
    id: 'relatorios', title: 'Relatórios', subtitle: 'Acompanhando o negócio', path: '/relatorios',
    steps: [
      { caption: 'Relatórios: uma visão geral do seu negócio.', wait: 2200 },
      { caption: 'No topo, os números do período: faturado, recebido e ticket médio.', wait: 2400 },
      { caption: 'Toque nos cards para abrir cada relatório.', wait: 1600, action: ({ page }) => page.getByText('Produtos (Top 10)').click() },
      { caption: 'Veja o ranking dos produtos mais vendidos.', wait: 2200 },
      { caption: 'Explore também formas de pagamento e categorias.', wait: 1800, action: ({ page }) => page.getByText('Formas de Pagamento').click() },
      { caption: 'E exporte tudo em Excel quando quiser. ✅', wait: 2400 },
    ],
  },
  {
    id: 'configuracoes', title: 'Configurações', subtitle: 'Personalizando o sistema', path: '/configuracoes',
    steps: [
      { caption: 'Configurações: ajuste o sistema do seu jeito.', wait: 2200 },
      { caption: 'Em Preferências, escolha os campos do cadastro de produtos.', wait: 2000 },
      { caption: 'Marque para exibir o campo Fornecedor.', wait: 1500, action: ({ page }) => page.getByText('Mostrar campo "Fornecedor"').click() },
      { caption: 'Ou o campo Observações — do jeito que preferir.', wait: 1500, action: ({ page }) => page.getByText('Mostrar campo "Observações"').click() },
      { caption: 'No final, toque em Salvar Alterações.', wait: 1800, action: ({ page }) => page.getByRole('button', { name: 'Salvar Alterações' }).click() },
      { caption: 'Configurações salvas! ✅', wait: 2400 },
    ],
  },
]
