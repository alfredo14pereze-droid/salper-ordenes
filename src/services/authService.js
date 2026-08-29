import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

export async function signIn(email, password) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { error: cfgError }

  return supabase.auth.signOut()
}

export async function fetchMyProfile(userId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('profiles').select('*').eq('id', userId).single()
}
