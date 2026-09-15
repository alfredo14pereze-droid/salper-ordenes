import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchMyProfile, signIn as signInRequest, signOut as signOutRequest } from '../services/authService'

const AuthContext = createContext(null)

const VIEW_AS_STORAGE_KEY = 'salper:viewAsRole'

function loadStoredViewAs() {
  try {
    return localStorage.getItem(VIEW_AS_STORAGE_KEY) || null
  } catch {
    return null
  }
}

// Expone el usuario de Supabase Auth + su perfil (nombre, rol) a toda la
// app. `loading` cubre tanto "todavía no sabemos si hay sesión" como
// "hay sesión pero aún no llega el perfil" — mientras loading es true,
// no hay que decidir nada basado en `role` (podría ser info vieja).
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // V53 — "ver como": admin_general puede simular la vista de cualquier
  // otro rol (nav, botones, tarjetas — todo lo que ya depende de `role`
  // en el resto de la app), SIN dejar de ser admin_general de verdad. Es
  // puramente de pantalla: los RPC de Supabase validan el rol real del
  // lado del servidor (current_user_role() lee el perfil, nunca confía
  // en nada que mande el cliente), así que esto no otorga ni quita
  // permisos reales — solo cambia qué ve la pantalla, para que el admin
  // pueda revisar cómo se ve el sistema para cada rol sin tener que
  // cerrar sesión y volver a entrar con otra cuenta. Se guarda en
  // localStorage (lazy init) para que sobreviva un refresh mientras se
  // está probando; se borra al cerrar sesión para que no se le quede
  // pegado a otra cuenta que entre después en el mismo navegador.
  const [viewAsRole, setViewAsRoleState] = useState(loadStoredViewAs)

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

  const trueRole = profile?.role || null

  // Si por lo que sea queda guardado un viewAsRole y la cuenta real ya
  // no es admin_general (cambió de cuenta, o a esta cuenta le quitaron
  // el rol), se limpia solo — nunca debe quedar "atorado" viendo como
  // otro rol sin ser admin_general de verdad.
  useEffect(() => {
    if (trueRole !== 'admin_general' && viewAsRole) {
      setViewAsRoleState(null)
      try {
        localStorage.removeItem(VIEW_AS_STORAGE_KEY)
      } catch {
        // localStorage no disponible (modo privado, etc.) — no es crítico.
      }
    }
  }, [trueRole, viewAsRole])

  function setViewAsRole(nextRole) {
    if (trueRole !== 'admin_general') return
    setViewAsRoleState(nextRole)
    try {
      if (nextRole) {
        localStorage.setItem(VIEW_AS_STORAGE_KEY, nextRole)
      } else {
        localStorage.removeItem(VIEW_AS_STORAGE_KEY)
      }
    } catch {
      // localStorage no disponible — la vista igual cambia para esta sesión.
    }
  }

  async function signIn(email, password) {
    return signInRequest(email, password)
  }

  async function signOut() {
    setViewAsRoleState(null)
    try {
      localStorage.removeItem(VIEW_AS_STORAGE_KEY)
    } catch {
      // no crítico
    }
    return signOutRequest()
  }

  const effectiveRole = trueRole === 'admin_general' && viewAsRole ? viewAsRole : trueRole

  const value = {
    user: session?.user || null,
    profile,
    role: effectiveRole,
    trueRole,
    viewAsRole: trueRole === 'admin_general' ? viewAsRole : null,
    setViewAsRole,
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
