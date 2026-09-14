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

// V42: para la constancia de situación fiscal en el detalle de una orden
// — `orders` solo guarda client_id (FK), no los datos del cliente, así
// que hay que pedirlo aparte.
export async function fetchClienteById(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('clientes').select('*').eq('id', id).single()
}

// "Crear o reusar" — ver create_cliente en supabase/schema_v12_catalogos.sql
// (y schema_v30_contacto_cliente_y_roles.sql para telefono/correo,
// schema_v45_categorias_cliente.sql para tipoOrden). El duplicado EXACTO
// (mismo nombre normalizado) nunca truena, regresa el existente — y si se
// manda telefono/correo/tipoOrden, actualiza esos datos del cliente ya
// existente (sin borrar lo guardado si se manda vacío/[] — ver el RPC: solo
// pisa tipo_orden si el arreglo mandado no está vacío). El duplicado
// "parecido" se avisa aparte en el frontend antes de llamar esto (ver
// utils/similarity.js), no aquí.
export async function createCliente(nombre, telefono, correo, tipoOrden = []) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_cliente', {
      p_nombre: nombre,
      p_telefono: telefono || null,
      p_correo: correo || null,
      p_tipo_orden: tipoOrden || [],
    })
    .single()
}

// V45: editar la categoría (escolar/industrial/sublimación) de un cliente
// que ya existe — necesario para los clientes de antes de este cambio, que
// quedan con tipo_orden vacío (y por lo tanto visibles en todas las listas
// filtradas) hasta que alguien les ponga categoría desde Catálogos.
export async function setClienteTipoOrden(id, tipoOrden) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('set_cliente_tipo_orden', { p_cliente_id: id, p_tipo_orden: tipoOrden || [] }).single()
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
