import { supabase } from '../lib/supabaseClient'

// V89/V90 — Inventario (artículos por fuera de Microsip), en modo prueba.
// Lectura de catálogos: directo con RLS (gateado por inv_puede_ver(), que a
// su vez exige inv_tiene_acceso() — ver supabase/schema_v89_inventario.sql).
// Existencias/historial/detalle: RPC de solo lectura (inv_existencias,
// inv_historial_articulo, etc. — son `security definer` porque cruzan
// varias tablas, pero validan el mismo permiso adentro). Escritura SIEMPRE
// por RPC — nunca insert/update directo desde el cliente.

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// --- Catálogos -----------------------------------------------------------

export async function fetchSecciones() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('inv_secciones').select('*').order('orden', { ascending: true }).order('nombre', { ascending: true })
}

export async function fetchUbicaciones() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('inv_ubicaciones').select('*').order('orden', { ascending: true }).order('nombre', { ascending: true })
}

export async function fetchTallas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('inv_tallas').select('*').order('orden', { ascending: true })
}

export async function fetchMotivos() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('inv_motivos').select('*').order('orden', { ascending: true })
}

// Solo para Administración: a diferencia de inv_existencias() (que solo
// trae artículos activos, para la pantalla principal), aquí se listan
// también los desactivados, para poder reactivarlos.
export async function fetchArticulosAdmin(seccionId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .from('inv_articulos')
    .select('*, inv_tallas(nombre, orden)')
    .eq('seccion_id', seccionId)
    .order('prenda', { ascending: true })
}

// --- Existencias / historial ----------------------------------------------

// p_seccion_id null = todas las secciones (se usa para el buscador global
// de artículos al armar un traspaso, por ejemplo).
export async function fetchExistencias(seccionId = null) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_existencias', { p_seccion_id: seccionId })
}

export async function fetchHistorialArticulo(articuloId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_historial_articulo', { p_articulo_id: articuloId })
}

// --- Movimiento manual (+ / -) --------------------------------------------

export async function registrarMovimiento({ articuloId, ubicacionId, tipo, cantidad, motivoId, nota }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('inv_registrar_movimiento', {
      p_articulo_id: articuloId,
      p_ubicacion_id: ubicacionId,
      p_tipo: tipo,
      p_cantidad: cantidad,
      p_motivo_id: motivoId,
      p_nota: nota || null,
    })
    .single()
}

// --- Traspasos -------------------------------------------------------------

export async function fetchTraspasos() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('inv_traspasos').select('*').order('creado_en', { ascending: false }).limit(300)
}

export async function fetchTraspasoDetalle(traspasoId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_traspaso_detalle', { p_traspaso_id: traspasoId })
}

// lineas: [{ articuloId, cantidad }]
export async function crearTraspaso({ origenId, destinoId, nota, lineas }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('inv_crear_traspaso', {
      p_origen_id: origenId,
      p_destino_id: destinoId,
      p_nota: nota || null,
      p_lineas: lineas.map((l) => ({ articulo_id: l.articuloId, cantidad: l.cantidad })),
    })
    .single()
}

// --- Conteos físicos ---------------------------------------------------

export async function fetchConteos() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('inv_conteos').select('*').order('creado_en', { ascending: false }).limit(200)
}

export async function crearConteo({ seccionId, ubicacionId }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_crear_conteo', { p_seccion_id: seccionId, p_ubicacion_id: ubicacionId }).single()
}

export async function fetchConteoLineas(conteoId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_conteo_lineas_detalle', { p_conteo_id: conteoId })
}

// lineas: [{ lineaId, conteo }] — solo las líneas que sí se capturaron.
export async function confirmarConteo({ conteoId, lineas }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('inv_confirmar_conteo', {
      p_conteo_id: conteoId,
      p_lineas: lineas.map((l) => ({ linea_id: l.lineaId, conteo: l.conteo })),
    })
    .single()
}

// --- Administración de catálogos ------------------------------------------

export async function guardarSeccion({ id, nombre, activa, orden }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_guardar_seccion', { p_id: id || null, p_nombre: nombre, p_activa: activa, p_orden: orden }).single()
}

export async function guardarUbicacion({ id, nombre, activa, orden }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_guardar_ubicacion', { p_id: id || null, p_nombre: nombre, p_activa: activa, p_orden: orden }).single()
}

export async function guardarMotivo({ id, nombre, activo, orden }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_guardar_motivo', { p_id: id || null, p_nombre: nombre, p_activo: activo, p_orden: orden }).single()
}

export async function guardarArticulo({ id, seccionId, prenda, tallaId, minimo, activo }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('inv_guardar_articulo', {
      p_id: id || null,
      p_seccion_id: seccionId,
      p_prenda: prenda,
      p_talla_id: tallaId,
      p_minimo: minimo === '' || minimo === null || minimo === undefined ? null : Number(minimo),
      p_activo: activo,
    })
    .single()
}
