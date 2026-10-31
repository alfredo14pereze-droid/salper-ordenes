import { supabase } from '../lib/supabaseClient'

// V172 — cotizaciones de destajo guardadas. Lectura directa (RLS: solo
// admin_general y admin_fabrica); escritura por RPC — ver
// supabase/schema_v172_cotizaciones_guardadas.sql.

function ensureClient() {
  if (!supabase) return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  return { error: null }
}

export async function fetchCotizacionesGuardadas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('cotizaciones_destajo').select('*').order('creado_en', { ascending: false })
}

export async function fetchCotizacionGuardada(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('cotizaciones_destajo').select('*').eq('id', id).maybeSingle()
}

export async function guardarCotizacion({ nombre, nota, prenda, folios, piezas, operadoras, costoPorSegundo, minutosDia }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('guardar_cotizacion_destajo', {
      p_nombre: nombre,
      p_nota: nota || null,
      p_prenda: prenda,
      p_folios: folios,
      p_piezas: Number(piezas),
      p_operadoras: Number(operadoras),
      p_costo_por_segundo: costoPorSegundo,
      p_minutos_dia: minutosDia,
    })
    .single()
}

export async function borrarCotizacion(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('borrar_cotizacion_destajo', { p_id: id })
}
