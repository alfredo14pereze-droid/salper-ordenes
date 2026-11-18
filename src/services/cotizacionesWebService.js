import { supabase } from '../lib/supabaseClient'

// V213 — Cotizaciones web. Lectura con RLS (admin_general/admin_tienda);
// el estado se cambia con cotizacion_web_cambiar_estado. Las cotizaciones
// solo entran por /api/cotizacion (ver supabase/schema_v213_cotizaciones_web.sql).
const sinSupabase = () => ({ error: new Error('Supabase no está configurado (revisa tu archivo .env).') })

export const ESTADOS_COTIZACION_WEB = [
  { key: 'nueva', label: 'Nueva' },
  { key: 'contactado', label: 'Contactado' },
  { key: 'cotizado', label: 'Cotizado' },
  { key: 'ganado', label: 'Ganado' },
  { key: 'perdido', label: 'Perdido' },
]

export const EVENTO_COTIZACIONES_WEB = 'salper:cotizaciones-web'

export async function fetchCotizacionesWeb() {
  if (!supabase) return sinSupabase()
  return supabase
    .from('cotizaciones_web')
    .select('id, created_at, nombre, empresa, telefono, correo, sector, productos, cantidad_aprox, personalizacion, fecha_deseada, mensaje, estado, origen')
    .order('created_at', { ascending: false })
    .limit(1000)
}

export async function contarCotizacionesNuevas() {
  if (!supabase) return sinSupabase()
  const { count, error } = await supabase
    .from('cotizaciones_web')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'nueva')
  return { data: count || 0, error }
}

export async function cambiarEstadoCotizacionWeb(id, estado) {
  if (!supabase) return sinSupabase()
  return supabase.rpc('cotizacion_web_cambiar_estado', { p_id: id, p_estado: estado })
}
