import { useQuery } from '@tanstack/react-query'
import { fetchConfig } from '@/lib/database'

export function useAppConfig() {
  const { data } = useQuery({
    queryKey: ['config'],
    queryFn: fetchConfig,
    staleTime: 5 * 60 * 1000, // 5 min cache
  })

  return {
    nomeApp: data?.nomeApp || 'Minha Loja',
    logoUrl: data?.logoUrl || null,
  }
}
