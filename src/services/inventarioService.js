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

// V119 — reporte global de movimientos (todas las prendas/secciones a la
// vez, filtrable por fecha/sección/ubicación/tipo). A diferencia de
// fetchHistorialArticulo (un solo artículo), este es para revisar
// actividad del día/semana/mes completos.
export async function fetchReporteMovimientos({ desde, hasta, seccionId = null, ubicacionId = null, tipo = null }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_reporte_movimientos', {
    p_desde: desde,
    p_hasta: hasta,
    p_seccion_id: seccionId,
    p_ubicacion_id: ubicacionId,
    p_tipo: tipo,
  })
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

// =====================================================================
// V121 — Catálogo estructurado (modelos, juegos de tallas, alias)
// =====================================================================

// Todo el catálogo (artículos + existencias + modelos + alias) en un solo
// JSON — ver inv_catalogo() en schema_v121: a propósito no son filas,
// para no chocar con el tope de 1000 filas de PostgREST que
// inv_existencias(null) ya rozaba (465 artículos x 2 ubicaciones).
// Si V121 todavía no está aplicado en la base, regresa
// { data: null, sinV121: true } y quien llama cae a inv_existencias.
export async function fetchCatalogo() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  const { data, error } = await supabase.rpc('inv_catalogo')
  if (error && (error.code === 'PGRST202' || error.code === '42883')) {
    return { data: null, error: null, sinV121: true }
  }
  return { data, error }
}

export async function fetchClasificaciones() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('inv_clasificaciones').select('*').order('orden', { ascending: true }).order('nombre', { ascending: true })
}

export async function fetchTiposPrenda() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('inv_tipos_prenda').select('*').order('orden', { ascending: true }).order('nombre', { ascending: true })
}

// Cada juego trae sus tallas (ids) ya en el orden definido.
export async function fetchJuegosTallas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  const { data, error } = await supabase
    .from('inv_juegos_tallas')
    .select('*, inv_juego_tallas_det(talla_id, orden)')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })
  if (error) return { data: null, error }
  return {
    data: (data || []).map(({ inv_juego_tallas_det: det, ...j }) => ({
      ...j,
      tallaIds: [...(det || [])].sort((a, b) => a.orden - b.orden).map((d) => d.talla_id),
    })),
    error: null,
  }
}

export async function guardarClasificacion({ id, nombre, activa, orden }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_guardar_clasificacion', { p_id: id || null, p_nombre: nombre, p_activa: activa, p_orden: orden }).single()
}

export async function guardarTipoPrenda({ id, nombre, activo, orden }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_guardar_tipo_prenda', { p_id: id || null, p_nombre: nombre, p_activo: activo, p_orden: orden }).single()
}

export async function guardarTalla({ id, nombre, orden }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_guardar_talla', { p_id: id || null, p_nombre: nombre, p_orden: Number(orden) }).single()
}

export async function guardarJuegoTallas({ id, nombre, activo, orden, tallaIds }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('inv_guardar_juego_tallas', { p_id: id || null, p_nombre: nombre, p_activo: activo, p_orden: orden, p_talla_ids: tallaIds })
    .single()
}

export async function clasificarSeccion({ seccionId, clasificacionId, clienteId }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('inv_clasificar_seccion', { p_seccion_id: seccionId, p_clasificacion_id: clasificacionId || null, p_cliente_id: clienteId || null })
    .single()
}

// Artículos (uno por talla) de un modelo — para darle entrada justo después
// de crearlo, sin esperar a que se recargue todo el catálogo.
export async function fetchArticulosModelo(modeloId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('inv_articulos').select('id, talla_id').eq('modelo_id', modeloId)
}

// Regresa { modelo_id, ya_existia, creados, vinculados }.
export async function crearModelo({ seccionId, tipoPrendaId, variante, juegoTallasId, tallaIds }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_crear_modelo', {
    p_seccion_id: seccionId,
    p_tipo_prenda_id: tipoPrendaId,
    p_variante: variante || null,
    p_juego_tallas_id: juegoTallasId || null,
    p_talla_ids: tallaIds,
  })
}

export async function agregarTallaModelo({ modeloId, tallaId }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_modelo_agregar_talla', { p_modelo_id: modeloId, p_talla_id: tallaId }).single()
}

// lineas: [{ articuloId, cantidad }] — SOLO las tallas que llegaron.
export async function registrarEntradaModelo({ modeloId, ubicacionId, motivoId, nota, lineas }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_entrada_modelo', {
    p_modelo_id: modeloId,
    p_ubicacion_id: ubicacionId,
    p_motivo_id: motivoId,
    p_nota: nota || null,
    p_lineas: lineas.map((l) => ({ articulo_id: l.articuloId, cantidad: l.cantidad })),
  })
}

export async function guardarAlias({ modeloId = null, articuloId = null, alias, origen }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('inv_guardar_alias', { p_modelo_id: modeloId, p_articulo_id: articuloId, p_alias: alias, p_origen: origen })
    .single()
}

export async function quitarAlias(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_quitar_alias', { p_id: id })
}

// grupos: [{ seccionId, tipoPrendaId, variante, articuloIds }] — todo o nada.
export async function vincularArticulos(grupos) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_vincular_articulos', {
    p_grupos: grupos.map((g) => ({
      seccion_id: g.seccionId,
      tipo_prenda_id: g.tipoPrendaId,
      variante: g.variante || null,
      articulo_ids: g.articuloIds,
    })),
  })
}

export async function desvincularArticulos(articuloIds) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('inv_desvincular_articulos', { p_articulo_ids: articuloIds })
}
