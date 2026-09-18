import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// V57 — Pedidos Colegio (beta, solo admin_general). Lectura directa de las
// tablas (RLS: solo admin_general), escritura SIEMPRE por RPC
// SECURITY DEFINER — ver supabase/schema_v57_pedidos_colegio.sql.

export async function fetchColegios() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('colegios').select('*').eq('activo', true).order('nombre', { ascending: true })
}

export async function createColegio(nombre, codigoFolio) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('create_colegio', { p_nombre: nombre, p_codigo_folio: codigoFolio }).single()
}

// Todos los pedidos vigentes, con sus abonos (solo el monto) para poder
// mostrar el saldo pendiente en la lista sin una consulta por pedido.
export async function fetchPedidos() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .from('colegio_pedidos')
    .select('*, colegio_pedido_abonos(monto)')
    .is('eliminado_en', null)
    .order('fecha_pedido', { ascending: false })
}

export async function fetchPedidoById(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  const { data, error } = await supabase
    .from('colegio_pedidos')
    .select('*, colegios(nombre, codigo_folio), colegio_pedido_articulos(*), colegio_pedido_abonos(*)')
    .eq('id', id)
    .single()
  if (error || !data) return { data: null, error }

  return {
    data: {
      ...data,
      colegio: data.colegios,
      articulos: [...(data.colegio_pedido_articulos || [])].sort((a, b) => a.posicion - b.posicion),
      abonos: [...(data.colegio_pedido_abonos || [])].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)),
    },
    error: null,
  }
}

// `articulos`: [{ articulo, talla, cantidad, precio_unitario }]. Anticipo:
// manda el monto si viene, si no el porcentaje (100 por default) — el
// servidor calcula subtotal, importes y el otro valor del anticipo.
export async function createPedido({
  colegioId,
  clienteNombre,
  clienteReferencia,
  clienteTelefono,
  anticipoPorcentaje,
  anticipoMonto,
  articulos,
}) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('create_colegio_pedido', {
      p_colegio_id: colegioId,
      p_cliente_nombre: clienteNombre,
      p_cliente_referencia: clienteReferencia || null,
      p_cliente_telefono: clienteTelefono || null,
      p_anticipo_porcentaje: anticipoMonto == null ? anticipoPorcentaje : null,
      p_anticipo_monto: anticipoMonto ?? null,
      p_articulos: articulos,
    })
    .single()
}

// `fecha`: 'YYYY-MM-DD' (input type=date). Se manda a mediodía local para
// que un timestamptz en UTC no caiga en el día anterior en México.
export async function addAbono(pedidoId, monto, nota, fecha) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('add_colegio_abono', {
      p_pedido_id: pedidoId,
      p_monto: monto,
      p_nota: nota || null,
      p_fecha: fecha ? new Date(`${fecha}T12:00:00`).toISOString() : null,
    })
    .single()
}

export async function deleteAbono(abonoId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('delete_colegio_abono', { p_abono_id: abonoId })
}

export async function softDeletePedido(pedidoId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('soft_delete_colegio_pedido', { p_pedido_id: pedidoId }).single()
}
