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

    // V44 — bug encontrado: esto ponía `loading=true` en CUALQUIER
    // evento de auth, incluido 'TOKEN_REFRESHED' — que Supabase dispara
    // solo con volver a la pestaña/app (revisa el token al recuperar
    // visibilidad), sin que el usuario haga nada. Como App.jsx muestra
    // <Loading/> en vez de las rutas mientras loading es true, TODA la
    // app (incluido "Nueva orden") se desmontaba y volvía a montar en
    // cada cambio de pestaña — perdiendo las fotos/PDFs elegidos (que
    // viven en memoria, no en el borrador de localStorage) aunque el
    // usuario no hubiera hecho nada. Ahora `loading` solo se usa para
    // una transición real de sesión (entrar/salir) — un refresco de
    // token de fondo actualiza el perfil sin desmontar nada.
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      setSession(nextSession)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        setLoading(true)
        await loadProfile(nextSession?.user?.id)
        setLoading(false)
      } else {
        await loadProfile(nextSession?.user?.id)
      }
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
