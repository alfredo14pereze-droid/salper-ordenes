import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// V100 — inventario de tela. El inventario "actual" de cada tela nunca se
// guarda como número editable: es la suma de sus movimientos (ver
// v_inventario_telas en schema_v100_inventario_tela.sql).
export async function fetchInventarioTelas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('v_inventario_telas').select('*').order('nombre', { ascending: true })
}

// v_movimientos_tela (no la tabla directo): usuario_id apunta a
// auth.users, no a profiles, así que PostgREST no puede resolver el
// nombre con un embed — la vista ya trae "usuario_nombre" resuelto.
export async function fetchMovimientosPorTela(telaId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('v_movimientos_tela').select('*').eq('tela_id', telaId).order('fecha', { ascending: false })
}

export async function registrarEntradaTela(telaId, cantidad, nota) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('registrar_entrada_tela', { p_tela_id: telaId, p_cantidad: cantidad, p_nota: nota }).single()
}

export async function registrarAjusteTela(telaId, cantidad, nota) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('registrar_ajuste_tela', { p_tela_id: telaId, p_cantidad: cantidad, p_nota: nota }).single()
}

// V101 — motor de cálculo de consumo estimado (Parte 3). `items` es el
// arreglo de prendas de una orden — guardada o el borrador que tienda
// todavía está armando en pantalla, no hace falta guardar primero.
// Regresa { por_tela: {tela_id: consumo}, sin_consumo: [...], unidad_no_coincide: [...] }.
export async function calcularConsumoOrden(items) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('calcular_consumo_orden', { p_items: items || [] })
}

// V102 — historial de movimientos de tela de UNA orden (para el resumen
// de corte real en el detalle de la orden).
export async function fetchMovimientosPorOrden(ordenId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('v_movimientos_tela').select('*').eq('orden_id', ordenId).order('fecha', { ascending: false })
}

// V102 — "Cortado": consumos = [{ tela_id, cantidad }], una entrada por
// cada tela que use la orden (todas obligatorias, ver marcar_corte). En
// una sola llamada: inserta el/los movimiento(s) consumo_corte y completa
// la etapa de corte en orden_etapas.
export async function marcarCorte(ordenId, consumos) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('marcar_corte', { p_orden_id: ordenId, p_consumos: consumos })
}
