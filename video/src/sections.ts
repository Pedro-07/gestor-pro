// Metadados de cada seção (título/subtítulo dos vídeos). Os ids batem com os
// nomes dos arquivos gerados pela captura: <id>.webm / chapters-<id>.json.
export const SECTIONS = [
  { id: 'pdv', title: 'PDV', subtitle: 'Registrando uma venda' },
  { id: 'estoque', title: 'Estoque', subtitle: 'Cadastrando um produto' },
  { id: 'vendas', title: 'Vendas', subtitle: 'Consultando suas vendas' },
  { id: 'consignacoes', title: 'Consignações', subtitle: 'Acerto de contas' },
  { id: 'relatorios', title: 'Relatórios', subtitle: 'Acompanhando o negócio' },
  { id: 'configuracoes', title: 'Configurações', subtitle: 'Personalizando o sistema' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']
