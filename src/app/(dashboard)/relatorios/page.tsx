import { redirect } from 'next/navigation'

// A seção Relatórios agora vive dentro do Financeiro. Mantemos a rota
// redirecionando para não quebrar links/bookmarks antigos.
export default function RelatoriosRedirect() {
  redirect('/financeiro')
}
