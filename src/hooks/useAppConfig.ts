import { useQuery } from '@tanstack/react-query'
import { fetchConfig } from '@/lib/database'
import type { MeioPagamentoConfig, CamposObrigatoriosCliente } from '@/types'

const DEFAULT_MEIOS: Record<string, MeioPagamentoConfig> = {
  dinheiro: { ativo: true, regra: false, valor: 0 },
  pix: { ativo: true, regra: false, valor: 0 },
  cartao: { ativo: true, regra: false, valor: 0 },
  promissoria: { ativo: true, regra: false, valor: 0 },
  consignado: { ativo: true, regra: false, valor: 0 },
}

export const DEFAULT_CAMPOS_OBRIGATORIOS_CLIENTE: CamposObrigatoriosCliente = {
  cpfCnpj: true,
  telefone: true,
  cidade: true,
  endereco: true,
}

export function useAppConfig() {
  const { data } = useQuery({
    queryKey: ['config'],
    queryFn: fetchConfig,
    staleTime: 5 * 60 * 1000, // 5 min cache
  })

  return {
    nomeApp: data?.nomeApp || 'Stok Master',
    logoUrl: data?.logoUrl || null,
    usarTamanhos: data?.usarTamanhos !== false,
    usarFornecedor: data?.usarFornecedor === true,
    usarObservacoes: data?.usarObservacoes === true,
    tamanhos: (data?.tamanhos && data.tamanhos.length ? data.tamanhos : ['PP', 'P', 'M', 'G', 'GG', 'XGG']) as string[],
    meiosPagamento: { ...DEFAULT_MEIOS, ...(data?.meiosPagamento ?? {}) },
    camposObrigatoriosCliente: { ...DEFAULT_CAMPOS_OBRIGATORIOS_CLIENTE, ...(data?.camposObrigatoriosCliente ?? {}) },
    slug: data?.slug ?? '',
    catalogoAtivo: data?.catalogoAtivo === true,
  }
}
