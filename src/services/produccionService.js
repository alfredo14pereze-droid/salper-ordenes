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
