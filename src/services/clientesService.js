import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

export async function fetchClientes() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('clientes').select('*').order('nombre', { ascending: true })
}

// "Crear o reusar" — ver create_cliente en supabase/schema_v12_catalogos.sql.
// El duplicado EXACTO (mismo nombre normalizado) nunca truena, regresa el
// existente. El duplicado "parecido" se avisa aparte en el frontend antes de
// llamar esto (ver utils/similarity.js), no aquí.
export async function createCliente(nombre) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('create_cliente', { p_nombre: nombre }).single()
}
