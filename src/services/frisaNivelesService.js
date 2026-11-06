import { supabase } from '../lib/supabaseClient'

// V184 — Niveles de inventario Frisa. Lectura directa (RLS: permiso fn.ver);
// escritura SIEMPRE por las funciones de supabase/schema_v184_frisa_niveles.sql.

const sinCliente = () => ({ data: null, error: new Error('Supabase no está configurado (revisa tu archivo .env).') })

export async function fetchFrisaNiveles() {
  if (!supabase) return sinCliente()
  const [cfg, prods] = await Promise.all([
    supabase.from('frisa_niveles_config').select('*').maybeSingle(),
    supabase.from('frisa_productos_niveles').select('*').eq('activo', true).order('clave', { ascending: true }).range(0, 4999),
  ])
  const error = cfg.error || prods.error
  if (error) return { data: null, error }
  return { data: { config: cfg.data, productos: prods.data || [] }, error: null }
}

export async function fetchConteosStock(productoId) {
  if (!supabase) return sinCliente()
  return supabase.from('frisa_conteos_stock').select('*').eq('producto_id', productoId).order('fecha', { ascending: false }).limit(200)
}

const rpc = (fn, args) => (supabase ? supabase.rpc(fn, args) : Promise.resolve(sinCliente()))

export const capturarStock = ({ clave, stock, comentario }) =>
  rpc('frisa_niveles_capturar_stock', { p_clave: clave, p_stock: stock, p_comentario: comentario || null })

export const guardarSupuestos = (c) =>
  rpc('frisa_niveles_guardar_config', {
    p_dias_periodo: c.dias_periodo, p_dias_maximo: c.dias_maximo, p_dias_reorden: c.dias_reorden, p_dias_minimo: c.dias_minimo,
    p_fecha_inicio: c.fecha_inicio_consumo || null, p_fecha_corte: c.fecha_corte_consumo || null,
  })

export const importarNiveles = (productos, config) =>
  rpc('frisa_niveles_importar', { p_productos: productos, p_config: config || null })
