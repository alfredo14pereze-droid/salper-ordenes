import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// Todos los perfiles — la policy de RLS solo deja ver esto si eres admin
// (o tu propio perfil); para un admin, esto trae la lista completa.
export async function fetchProfiles() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('profiles').select('*').order('full_name', { ascending: true })
}

export async function updateUserRole(userId, role, fullName) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('admin_update_user_role', { p_user_id: userId, p_role: role, p_full_name: fullName || null })
    .single()
}

// Crea un usuario nuevo (auth + perfil) llamando a la Edge Function
// admin-create-user. La función misma verifica que quien llama sea
// admin — aquí solo se manda la sesión actual, nunca ninguna llave
// privilegiada (esta app no tiene ni conoce la service role key).
// `confirmPassword` se manda tal cual junto con `password` — la Edge
// Function vuelve a validar que coincidan (ver
// supabase/functions/admin-create-user/index.ts) por si alguien llama al
// endpoint directo, saltándose la validación de UsersPage.jsx.
export async function createUser({ email, password, confirmPassword, fullName, role }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) {
    return { data: null, error: new Error('No hay una sesión activa.') }
  }

  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: { email, password, password_confirm: confirmPassword, full_name: fullName, role },
    headers: { Authorization: `Bearer ${token}` },
  })

  if (error) {
    // supabase-js no siempre expone el mensaje de error del cuerpo de la
    // respuesta cuando el status no es 2xx — intentamos leerlo nosotros.
    const context = error.context
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json()
        if (body?.error) return { data: null, error: new Error(body.error) }
      } catch {
        // sigue con el error genérico de abajo
      }
    }
    return { data: null, error }
  }

  if (data?.error) {
    return { data: null, error: new Error(data.error) }
  }

  return { data: data?.user, error: null }
}
