'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          uid: session.user.id,
          email: session.user.email ?? '',
          name: session.user.user_metadata?.name ?? session.user.email ?? '',
        })
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          uid: session.user.id,
          email: session.user.email ?? '',
          name: session.user.user_metadata?.name ?? session.user.email ?? '',
        })
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [setUser, setLoading])

  return <>{children}</>
}
