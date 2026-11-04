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
  const [pl, pr, mx, mv, oc, ocl, ot, otl, al] = await Promise.all([
    todas('frisa_plantas', [['nombre', true]]),
    todas('frisa_productos', [['sku', true]]),
    todas('frisa_maximos', [['planta_id', true]]),
    todas('frisa_movimientos', [['fecha', false], ['creado_en', false]]),
    // V181 — órdenes de compra, órdenes de taller y lo aprendido de los PDFs.
    todas('frisa_ordenes_compra', [['creado_en', false]]),
    todas('frisa_oc_lineas', [['oc_id', true]]),
    todas('frisa_ordenes_taller', [['creado_en', false]]),
    todas('frisa_ot_lineas', [['ot_id', true]]),
    todas('frisa_producto_alias', [['texto', true]]),
  ])
  const error = [pl, pr, mx, mv, oc, ocl, ot, otl, al].find((x) => x.error)?.error
  if (error) return { data: null, error }
  return {
    data: {
      plantas: pl.data, productos: pr.data, maximos: mx.data, movimientos: mv.data,
      ordenes: oc.data, ocLineas: ocl.data, talleres: ot.data, otLineas: otl.data, alias: al.data,
    },
    error: null,
  }
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

// ---------- V181 ----------
export const guardarPlanta = ({ id, nombre, activa }) => rpc('frisa_guardar_planta', { p_id: id || null, p_nombre: nombre, p_activa: activa ?? true })
export const guardarProducto = ({ id, sku, modelo, talla, precio, activo }) =>
  rpc('frisa_guardar_producto', { p_id: id || null, p_sku: sku, p_modelo: modelo, p_talla: talla || null, p_precio: precio, p_activo: activo ?? true })
export const guardarOC = ({ numero, plantaId, fechaOc, fechaLimite, lineas, notas, leido }) =>
  rpc('frisa_guardar_oc', {
    p_numero: numero, p_planta_id: plantaId, p_fecha_oc: fechaOc || null, p_fecha_limite: fechaLimite || null,
    p_lineas: lineas, p_notas: notas || null, p_leido: leido || null, p_aprender: true,
  })
export const cancelarOC = (ocId, motivo) => rpc('frisa_cancelar_oc', { p_oc_id: ocId, p_motivo: motivo })
export const crearOT = ({ ocId, lineas, fechaCompromiso, notas }) =>
  rpc('frisa_crear_ot', { p_oc_id: ocId, p_lineas: lineas, p_fecha_compromiso: fechaCompromiso || null, p_notas: notas || null })
export const terminarOT = (otId, fecha) => rpc('frisa_terminar_ot', { p_ot_id: otId, p_fecha: fecha })
export const armarOC = (ocId) => rpc('frisa_armar_oc', { p_oc_id: ocId })
export const desarmarOC = (ocId) => rpc('frisa_desarmar_oc', { p_oc_id: ocId })
export const entregarOC = (ocId, fecha, remision) => rpc('frisa_entregar_oc', { p_oc_id: ocId, p_fecha: fecha, p_remision: remision })
