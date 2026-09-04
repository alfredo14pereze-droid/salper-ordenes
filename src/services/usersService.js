import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// Todos los perfiles — la policy de RLS solo deja ver esto si eres
// admin_general (o tu propio perfil); para admin_general, esto trae la
// lista completa.
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

// Todas las acciones de gestión de usuarios (crear, editar, suspender,
// eliminar) pasan por la misma Edge Function admin-create-user, que
// verifica que quien llama sea admin_general — aquí solo se manda la
// sesión actual, nunca ninguna llave privilegiada (esta app no tiene ni
// conoce la service role key). Ver supabase/functions/admin-create-user/index.ts.
async function invokeAdminUserFn(body) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) {
    return { data: null, error: new Error('No hay una sesión activa.') }
  }

  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body,
    headers: { Authorization: `Bearer ${token}` },
  })

  if (error) {
    // supabase-js no siempre expone el mensaje de error del cuerpo de la
    // respuesta cuando el status no es 2xx — intentamos leerlo nosotros.
    const context = error.context
    if (context && typeof context.json === 'function') {
      try {
        const errBody = await context.json()
        if (errBody?.error) return { data: null, error: new Error(errBody.error) }
      } catch {
        // sigue con el error genérico de abajo
      }
    }
    return { data: null, error }
  }

  if (data?.error) {
    return { data: null, error: new Error(data.error) }
  }

  return { data, error: null }
}

// `confirmPassword` se manda tal cual junto con `password` — la Edge
// Function vuelve a validar que coincidan por si alguien llama al
// endpoint directo, saltándose la validación de UsersPage.jsx.
export async function createUser({ email, password, confirmPassword, fullName, role }) {
  const { data, error } = await invokeAdminUserFn({
    action: 'create',
    email,
    password,
    password_confirm: confirmPassword,
    full_name: fullName,
    role,
  })
  return { data: data?.user, error }
}

// Edita nombre y/o correo de un usuario existente (auth + perfil).
export async function updateUserProfile(userId, { fullName, email } = {}) {
  return invokeAdminUserFn({ action: 'update', user_id: userId, full_name: fullName || undefined, email: email || undefined })
}

// Suspende/reactiva el login del usuario en Supabase Auth (ban_duration)
// y refleja el estado en profiles.suspended_at.
export async function suspendUser(userId) {
  return invokeAdminUserFn({ action: 'suspend', user_id: userId })
}

export async function unsuspendUser(userId) {
  return invokeAdminUserFn({ action: 'unsuspend', user_id: userId })
}

// Elimina el usuario de auth.users — profiles.id tiene ON DELETE CASCADE
// hacia auth.users(id), así que el perfil se borra solo.
export async function deleteUser(userId) {
  return invokeAdminUserFn({ action: 'delete', user_id: userId })
}
