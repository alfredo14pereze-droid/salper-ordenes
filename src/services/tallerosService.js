import { supabase } from '../lib/supabaseClient'
import { isActiveStatus } from '../utils/status'

const BUCKET = 'mt-fotos'
export const MAX_FOTO_SIZE_MB = 5

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// V63 — Talleros. Lectura directa (RLS: cualquier rol con sesión salvo
// `tienda`); escritura SIEMPRE por RPC SECURITY DEFINER — ver
// supabase/schema_v63_talleros.sql.

export const ESTADOS_USO = [
  { key: 'disponible', label: 'Disponible' },
  { key: 'prestado', label: 'Prestado' },
  { key: 'en_reparacion', label: 'En reparación' },
]

export const ESTADOS_CONTENIDO = [
  { key: 'completo', label: 'Completo' },
  { key: 'incompleto', label: 'Incompleto' },
]

export const UBICACIONES = [
  { key: 'tienda', label: 'Tienda' },
  { key: 'fabrica', label: 'Fábrica' },
]

export const COLORES_TALLERO = ['Azul', 'Verde', 'Amarillo', 'Cielo', 'Rosa', 'Naranja', 'Negro']

export async function fetchProductosTalleros() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('mt_productos').select('*').order('nombre', { ascending: true })
}

export async function fetchTalleros() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .from('mt_contenedores')
    .select('*, mt_productos(nombre)')
    .is('eliminada_en', null)
    .order('codigo', { ascending: true })
}

export async function fetchTalleroById(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('mt_contenedores').select('*, mt_productos(nombre)').eq('id', id).single()
}

export async function fetchMovimientos(contenedorId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .from('mt_movimientos')
    .select('*, orders(order_number)')
    .eq('contenedor_id', contenedorId)
    .order('fecha', { ascending: false })
}

// Órdenes activas para el vínculo opcional al prestar.
export async function fetchOrdenesParaVincular() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, client_name, status')
    .is('eliminada_en', null)
    .order('order_number', { ascending: false })
    .limit(300)
  return { data: data ? data.filter((o) => isActiveStatus(o.status)) : data, error }
}

export async function uploadTalleroFoto(file) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  if (!file.type.startsWith('image/')) return { data: null, error: new Error(`"${file.name}" no es una imagen.`) }
  if (file.size > MAX_FOTO_SIZE_MB * 1024 * 1024) {
    return { data: null, error: new Error(`"${file.name}" pesa más de ${MAX_FOTO_SIZE_MB}MB.`) }
  }
  const ext = file.name.split('.').pop()
  const path = `${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file)
  if (uploadError) return { data: null, error: uploadError }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { data: { path, url: data.publicUrl }, error: null }
}

function paramsTallero(v, foto) {
  return {
    p_producto_id: v.productoId || null,
    p_tallas: v.tallas || null,
    p_tallas_faltantes: v.tallasFaltantes || null,
    p_estado_contenido: v.estadoContenido || null,
    p_color: v.color || null,
    p_tela: v.tela || null,
    p_ubicacion: v.ubicacion || null,
    p_estanteria: v.estanteria || null,
    p_observaciones: v.observaciones || null,
    p_estado_uso: v.estadoUso || null,
    p_foto_path: foto?.path || null,
    p_foto_url: foto?.url || null,
  }
}

export async function createTallero(values, foto) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('mt_crear_contenedor', paramsTallero(values, foto)).single()
}

export async function updateTallero(id, values, foto) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('mt_actualizar_contenedor', { p_id: id, ...paramsTallero(values, foto) }).single()
}

export async function darDeBajaTallero(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('mt_dar_de_baja', { p_id: id }).single()
}

export async function prestarTallero({ id, personaEquipo, personaExterna, ordenId, notas, tallasPrestadas, telefono, deposito }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('mt_prestar', {
      p_contenedor_id: id,
      p_persona_equipo: personaEquipo,
      p_persona_externa: personaExterna,
      p_orden_id: ordenId || null,
      p_notas: notas || null,
      p_tallas_prestadas: tallasPrestadas || null,
      p_telefono: telefono || null,
      p_deposito: deposito > 0 ? deposito : null,
    })
    .single()
}

export async function devolverTallero({ id, personaExterna, personaEquipo, notas, estadoContenido, tallasFaltantes, depositoDevuelto }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('mt_devolver', {
      p_contenedor_id: id,
      p_persona_externa: personaExterna || null,
      p_persona_equipo: personaEquipo,
      p_notas: notas || null,
      p_estado_contenido: estadoContenido || null,
      p_tallas_faltantes: tallasFaltantes || null,
      p_deposito_devuelto: depositoDevuelto > 0 ? depositoDevuelto : null,
    })
    .single()
}

export async function guardarProductoTallero({ id, nombre, categoria, activo }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('mt_guardar_producto', { p_id: id || null, p_nombre: nombre, p_categoria: categoria || null, p_activo: activo ?? true })
    .single()
}
