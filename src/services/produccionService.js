import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  return { error: null }
}

// V68 — Producción, captura. Catálogos por SELECT directo (RLS: admin_general,
// admin_fabrica y captura_produccion); TODO lo de registros pasa por RPC que
// NUNCA devuelve montos en pesos (ver supabase/schema_v68_produccion_captura.sql).

export async function fetchOperadorasActivas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .from('prod_operadoras')
    .select('id, numero_operadora, nombre, puesto')
    .eq('activo', true)
    .order('numero_operadora', { ascending: true, nullsFirst: false })
}

export async function fetchOperaciones() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('prod_operaciones').select('folio, prenda, parte, operacion, segundos, activa').order('folio')
}

// Semana (o null si todavía no existe) que le toca a una fecha 'yyyy-mm-dd'.
export async function fetchSemanaPorInicio(fechaInicio) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('prod_semanas').select('id, fecha_inicio, fecha_fin, estado').eq('fecha_inicio', fechaInicio).maybeSingle()
}

export async function capturarRegistro({ fecha, operadoraId, folio, piezas, confirmado }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_capturar_registro', {
    p_fecha: fecha,
    p_operadora_id: operadoraId,
    p_folio: folio,
    p_piezas: piezas,
    p_confirmado: !!confirmado,
  })
}

export async function editarRegistro({ id, folio, piezas, confirmado }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_editar_registro', { p_id: id, p_folio: folio, p_piezas: piezas, p_confirmado: !!confirmado })
}

export async function borrarRegistro(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_borrar_registro', { p_id: id })
}

export async function listarRegistros(fecha, operadoraId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_listar_registros', { p_fecha: fecha, p_operadora_id: operadoraId })
}

export async function resumenCaptura(fecha) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_resumen_captura', { p_fecha: fecha })
}

// V69 — Revisión y aprobación (SOLO admin_general / admin_fabrica; traen montos).
export async function listarSemanas(limit = 30) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_listar_semanas', { p_limit: limit })
}

export async function revisionSemana(semanaId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_revision_semana', { p_semana_id: semanaId })
}

export async function cerrarSemana(semanaId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_cerrar_semana', { p_semana_id: semanaId }).single()
}

export async function aprobarSemana(semanaId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_aprobar_semana', { p_semana_id: semanaId }).single()
}

export async function reabrirSemana(semanaId, motivo) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_reabrir_semana', { p_semana_id: semanaId, p_motivo: motivo }).single()
}

export async function fetchRegistrosOperadora(semanaId, operadoraId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .from('prod_registros')
    .select('id, fecha, piezas, valor, folio_operacion, prod_operaciones(prenda, parte, operacion)')
    .eq('semana_id', semanaId)
    .eq('operadora_id', operadoraId)
    .order('fecha', { ascending: true })
}

// V70 — Dashboard, imprimibles y administración de catálogos (admin_general / admin_fabrica).
export async function historialValores(semanas = 16) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_historial_valores', { p_semanas: semanas })
}

export async function fetchOperadorasTodas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('prod_operadoras').select('*').order('numero_operadora', { ascending: true, nullsFirst: false })
}

export async function fetchOperacionesTodas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('prod_operaciones').select('folio, prenda, parte, operacion, segundos, activa').order('folio')
}

export async function fetchReglas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('prod_reglas_premios').select('*').order('desde', { ascending: true })
}

export async function fetchConfig() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('prod_config').select('clave, valor')
}

export async function guardarOperacion({ folio, prenda, parte, operacion, segundos, activa, nuevo }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('prod_guardar_operacion', { p_folio: folio, p_prenda: prenda, p_parte: parte, p_operacion: operacion, p_segundos: segundos, p_activa: activa, p_nuevo: !!nuevo })
    .single()
}

export async function guardarOperadora({ id, folioEmpleado, numero, nombre, puesto, participa, activo }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('prod_guardar_operadora', {
      p_id: id || null,
      p_folio_empleado: folioEmpleado,
      p_numero: numero === '' || numero == null ? null : Number(numero),
      p_nombre: nombre,
      p_puesto: puesto || null,
      p_participa: participa,
      p_activo: activo,
    })
    .single()
}

export async function guardarRegla({ id, tipo, desde, bono, activa }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_guardar_regla', { p_id: id || null, p_tipo: tipo, p_desde: desde, p_bono: bono, p_activa: activa }).single()
}

export async function guardarConfig(precio, segundos) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_guardar_config', { p_precio: precio, p_segundos: segundos })
}

// V72 — Estadísticas de producción (admin_general / admin_fabrica). Todo el cálculo vive en Supabase
// (supabase/schema_v72_produccion_estadisticas.sql); aquí solo se piden los datos.
export async function statsInfo() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_stats_info')
}
export async function statsSemanas(operadoraId = null) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_stats_semanas', { p_desde: null, p_hasta: null, p_operadora: operadoraId })
}
export async function statsDistribucionMeta(semanaId, operadoraId = null) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_stats_distribucion_meta', { p_semana_id: semanaId, p_operadora: operadoraId })
}
export async function statsDestacados(semanaId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_stats_destacados', { p_semana_id: semanaId, p_umbral: 10 })
}
export async function statsPrendas(desde, hasta, operadoraId = null) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_stats_prendas', { p_desde: desde, p_hasta: hasta, p_operadora: operadoraId })
}
export async function statsOperaciones(desde, hasta, operadoraId = null) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_stats_operaciones', { p_desde: desde, p_hasta: hasta, p_operadora: operadoraId })
}
export async function statsDias(desde, hasta, operadoraId = null) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('prod_stats_dias', { p_desde: desde, p_hasta: hasta, p_operadora: operadoraId })
}
