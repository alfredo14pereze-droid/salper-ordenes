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

// "Crear o reusar" — ver create_cliente en supabase/schema_v12_catalogos.sql
// (y schema_v30_contacto_cliente_y_roles.sql para telefono/correo). El
// duplicado EXACTO (mismo nombre normalizado) nunca truena, regresa el
// existente — y si se manda telefono/correo, actualiza esos datos del
// cliente ya existente (sin borrar lo guardado si se manda vacío). El
// duplicado "parecido" se avisa aparte en el frontend antes de llamar esto
// (ver utils/similarity.js), no aquí.
export async function createCliente(nombre, telefono, correo) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_cliente', { p_nombre: nombre, p_telefono: telefono || null, p_correo: correo || null })
    .single()
}

// Hard-delete (V24) — exclusivo admin_general. productos.cliente_id tiene
// ON DELETE CASCADE, así que borrar un cliente borra también sus
// productos guardados — por eso el impact-check antes de confirmar.
export async function getClienteDeleteImpact(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('get_cliente_delete_impact', { p_id: id }).single()
}

export async function deleteCliente(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('delete_cliente', { p_id: id })
}
