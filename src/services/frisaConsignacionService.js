import { supabase } from '../lib/supabaseClient'

// V180 — Frisa a consignación (PRUEBA, solo admin_general). Lectura directa
// de las tablas frisa_* (RLS: solo admin_general); escritura SIEMPRE por las
// funciones de supabase/schema_v180_frisa_consignacion_prueba.sql.

const sinCliente = () => ({ data: null, error: new Error('Supabase no está configurado (revisa tu archivo .env).') })

// Supabase regresa máximo 1000 filas por consulta: se pide por páginas.
async function todas(tabla, orden) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    let q = supabase.from(tabla).select('*')
    for (const [col, asc] of orden) q = q.order(col, { ascending: asc })
    const { data, error } = await q.range(desde, desde + 999)
    if (error) return { data: null, error }
    out.push(...data)
    if (data.length < 1000) return { data: out, error: null }
  }
}

export async function fetchFrisaTodo() {
  if (!supabase) return sinCliente()
  const [pl, pr, mx, mv] = await Promise.all([
    todas('frisa_plantas', [['nombre', true]]),
    todas('frisa_productos', [['sku', true]]),
    todas('frisa_maximos', [['planta_id', true]]),
    todas('frisa_movimientos', [['fecha', false], ['creado_en', false]]),
  ])
  const error = pl.error || pr.error || mx.error || mv.error
  if (error) return { data: null, error }
  return { data: { plantas: pl.data, productos: pr.data, maximos: mx.data, movimientos: mv.data }, error: null }
}

const rpc = (fn, args) => (supabase ? supabase.rpc(fn, args) : Promise.resolve(sinCliente()))

export const registrarProduccion = ({ fecha, productoId, cantidad, referencia, notas }) =>
  rpc('frisa_registrar_produccion', { p_fecha: fecha, p_producto_id: productoId, p_cantidad: cantidad, p_referencia: referencia || null, p_notas: notas || null })

export const registrarEntrega = ({ fecha, lineas, referencia, notas }) =>
  rpc('frisa_registrar_entrega', { p_fecha: fecha, p_lineas: lineas, p_referencia: referencia || null, p_notas: notas || null })

export const registrarConsumo = ({ fecha, plantaId, lineas, referencia, notas }) =>
  rpc('frisa_registrar_consumo', { p_fecha: fecha, p_planta_id: plantaId, p_lineas: lineas, p_referencia: referencia || null, p_notas: notas || null })

export const registrarConfirmacion = ({ fecha, plantaId, lineas, notas }) =>
  rpc('frisa_registrar_confirmacion', { p_fecha: fecha, p_planta_id: plantaId, p_lineas: lineas, p_notas: notas || null })

export const setMaximo = (plantaId, productoId, maximo) =>
  rpc('frisa_set_maximo', { p_planta_id: plantaId, p_producto_id: productoId, p_maximo: maximo })

export const cargarDatosPrueba = (datos) => rpc('frisa_cargar_datos_prueba', { p_datos: datos })
export const borrarDatosPrueba = () => rpc('frisa_borrar_datos_prueba', {})
