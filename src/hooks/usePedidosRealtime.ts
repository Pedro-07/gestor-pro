import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

/**
 * Avisa a dona na hora em que um pedido novo chega pela loja online
 * (Supabase Realtime — requer a migration 013, que adiciona a tabela
 * `pedidos` à publicação `supabase_realtime`). O RLS garante que cada
 * loja só recebe os próprios pedidos.
 */
export function usePedidosRealtime() {
  const qc = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('pedidos-novos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, (payload) => {
        const nome = (payload.new as { clienteNome?: string }).clienteNome
        toast.success(`Novo pedido recebido${nome ? ` de ${nome}` : ''}! 🛍️`, {
          description: 'Veja os detalhes na aba Pedidos.',
          duration: 8000,
        })
        qc.invalidateQueries({ queryKey: ['pedidos'] })
        qc.invalidateQueries({ queryKey: ['pedidos-novos-count'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [qc])
}
