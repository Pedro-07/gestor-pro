'use client'

/**
 * DataPrefetcher — sem UI, só carrega dados.
 *
 * Popula o React Query com dados de todas as coleções em paralelo
 * assim que o usuário é autenticado. As páginas renderizam sem skeleton
 * se os dados já estiverem no cache do React Query.
 */

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth-store'
import {
  fetchClientes,
  fetchProdutos,
  fetchParcelas,
  fetchVendas,
  fetchFornecedores,
  fetchConfig,
} from '@/lib/database'

export function DataPrefetcher() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const prefetchedRef = useRef(false)

  useEffect(() => {
    if (!user || prefetchedRef.current) return
    prefetchedRef.current = true

    // Carrega todas as coleções em paralelo
    const prefetch = async (key: string[], fn: () => Promise<unknown>) => {
      try {
        const data = await fn()
        qc.setQueryData(key, data)
      } catch (err) {
        console.warn(`[DataPrefetcher] error ${key[0]}:`, err)
      }
    }

    prefetch(['clientes'], fetchClientes)
    prefetch(['produtos'], fetchProdutos)
    prefetch(['parcelas'], fetchParcelas)
    prefetch(['vendas'], fetchVendas)
    prefetch(['fornecedores'], fetchFornecedores)
    prefetch(['config'], fetchConfig)
  }, [user, qc])

  return null
}
