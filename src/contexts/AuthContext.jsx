import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchMyProfile, signIn as signInRequest, signOut as signOutRequest } from '../services/authService'

const AuthContext = createContext(null)

// Expone el usuario de Supabase Auth + su perfil (nombre, rol) a toda la
// app. `loading` cubre tanto "todavía no sabemos si hay sesión" como
// "hay sesión pero aún no llega el perfil" — mientras loading es true,
// no hay que decidir nada basado en `role` (podría ser info vieja).
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await fetchMyProfile(userId)
    setProfile(data || null)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      setSession(initialSession)
      await loadProfile(initialSession?.user?.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession)
      setLoading(true)
      await loadProfile(nextSession?.user?.id)
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [loadProfile])

  async function signIn(email, password) {
    return signInRequest(email, password)
  }

  async function signOut() {
    return signOutRequest()
  }

  const value = {
    user: session?.user || null,
    profile,
    role: profile?.role || null,
    loading,
    signIn,
    signOut,
    refreshProfile: () => loadProfile(session?.user?.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
