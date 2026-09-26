import { supabase } from '../lib/supabaseClient'

// V78 — Pendientes tienda <-> fábrica. Todo cambio de estado pasa por RPC (el
// servidor valida rol y transición). Ver supabase/schema_v78_pendientes_tienda_fabrica.sql.

const PHOTO_BUCKET = 'order-photos'
export const MAX_PENDIENTE_PHOTO_SIZE_MB = 5

function ensureClient() {
  if (!supabase) return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  return { error: null }
}

export const ESTADOS = {
  enviado_a_fabrica: { label: 'Enviado a fábrica', short: 'En camino a fábrica' },
  recibido_en_fabrica: { label: 'Recibido en fábrica', short: 'Por hacer' },
  listo_para_regresar: { label: 'Listo para regresar', short: 'Listo para regresar' },
  enviado_a_tienda: { label: 'Enviado a tienda', short: 'De regreso a tienda' },
  recibido_en_tienda: { label: 'Recibido en tienda', short: 'Cerrado' },
  con_problema: { label: 'Con problema', short: 'Con problema' },
}

// Siguiente paso de cada estado y quién lo confirma (espejo de pf_aplicar).
export const SIGUIENTE = {
  enviado_a_fabrica: { next: 'recibido_en_fabrica', label: 'Confirmar recibido', quien: 'fabrica' },
  recibido_en_fabrica: { next: 'listo_para_regresar', label: 'Marcar listo', quien: 'fabrica' },
  listo_para_regresar: { next: 'enviado_a_tienda', label: 'Confirmar envío a tienda', quien: 'fabrica' },
  enviado_a_tienda: { next: 'recibido_en_tienda', label: 'Confirmar recibido', quien: 'tienda' },
}

const SELECT = '*, tipo:pf_tipos_trabajo(nombre), cliente:clientes(nombre), orden:orders(order_number)'

export async function fetchPendientes() {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.from('pf_pendientes').select(SELECT).order('created_at', { ascending: true })
}

export async function fetchPendiente(id) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.from('pf_pendientes').select(SELECT).eq('id', id).single()
}

export async function fetchHistorial(id) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.from('pf_historial').select('*').eq('pendiente_id', id).order('created_at', { ascending: true })
}

export async function fetchTipos({ soloActivos = true } = {}) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  let q = supabase.from('pf_tipos_trabajo').select('*').order('orden', { ascending: true }).order('nombre', { ascending: true })
  if (soloActivos) q = q.eq('activo', true)
  return q
}

export async function guardarTipo({ id = null, nombre, activo = true, orden = null }) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.rpc('pf_guardar_tipo', { p_id: id, p_nombre: nombre, p_activo: activo, p_orden: orden }).single()
}

export async function uploadPendientePhoto(file) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  if (!file.type.startsWith('image/')) return { data: null, error: new Error(`"${file.name}" no es una imagen.`) }
  if (file.size > MAX_PENDIENTE_PHOTO_SIZE_MB * 1024 * 1024) {
    return { data: null, error: new Error(`"${file.name}" pesa más de ${MAX_PENDIENTE_PHOTO_SIZE_MB}MB.`) }
  }
  const ext = file.name.split('.').pop()
  const path = `pendientes/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file)
  if (uploadError) return { data: null, error: uploadError }
  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
  return { data: { path, url: data.publicUrl }, error: null }
}

export async function crearPendiente({ descripcion, tipoId, cantidad, fechaRequerida, clienteId, orderId, fotos, esParaCliente, clienteNombre, clienteTelefono, prenda, talla }) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase
    .rpc('pf_crear', {
      p_descripcion: descripcion,
      p_tipo_id: tipoId,
      p_cantidad: cantidad,
      p_fecha_requerida: fechaRequerida,
      p_cliente_id: clienteId || null,
      p_order_id: orderId || null,
      p_fotos: fotos || [],
      p_es_para_cliente: !!esParaCliente,
      p_cliente_nombre: clienteNombre || null,
      p_cliente_telefono: clienteTelefono || null,
      p_prenda: prenda || null,
      p_talla: talla || null,
    })
    .single()
}

export async function editarPendiente({ id, descripcion, tipoId, cantidad, fechaRequerida, clienteId, orderId, fotos, esParaCliente, clienteNombre, clienteTelefono, prenda, talla }) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase
    .rpc('pf_editar', {
      p_id: id,
      p_descripcion: descripcion,
      p_tipo_id: tipoId,
      p_cantidad: cantidad,
      p_fecha_requerida: fechaRequerida,
      p_cliente_id: clienteId || null,
      p_order_id: orderId || null,
      p_fotos: fotos || [],
      p_es_para_cliente: !!esParaCliente,
      p_cliente_nombre: clienteNombre || null,
      p_cliente_telefono: clienteTelefono || null,
      p_prenda: prenda || null,
      p_talla: talla || null,
    })
    .single()
}

export async function cambiarEstado(id, nuevo, nota) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.rpc('pf_cambiar_estado', { p_id: id, p_nuevo: nuevo, p_nota: nota || null }).single()
}

export async function resolverProblema(id, nota) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.rpc('pf_resolver_problema', { p_id: id, p_nota: nota || null }).single()
}

export async function cambiarEstadoLote(ids, nuevo, nota) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.rpc('pf_cambiar_estado_lote', { p_ids: ids, p_nuevo: nuevo, p_nota: nota || null })
}

export function subscribeToPendientes(onChange) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('pf-pendientes-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pf_pendientes' }, onChange)
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// Alertas visuales (solo presentación; no hay lógica de negocio del servidor aquí).
export function diasParaFecha(fechaStr) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const f = new Date(`${fechaStr}T00:00:00`)
  return Math.round((f - hoy) / 86400000)
}

// Enviado a fábrica y sin recibir después de 1 día.
export function sinRecibirAlerta(p) {
  return p.estado === 'enviado_a_fabrica' && Date.now() - new Date(p.estado_desde).getTime() > 24 * 3600 * 1000
}

export function urgenciaFecha(p) {
  // Ya no se captura fecha de regreso (V82); solo hay urgencia en pendientes viejos que sí la traen.
  if (p.estado === 'recibido_en_tienda' || !p.fecha_requerida) return null
  const d = diasParaFecha(p.fecha_requerida)
  if (d <= 0) return { nivel: 'rojo', label: d < 0 ? `Vencido hace ${-d} d` : 'Para hoy' }
  if (d <= 2) return { nivel: 'amarillo', label: d === 1 ? 'Para mañana' : `En ${d} días` }
  return { nivel: null, label: `En ${d} días` }
}
