import { supabase } from '../lib/supabaseClient'
import { fetchFrisaNiveles } from './frisaNivelesService'
import { fetchSurtidosYLineas } from './frisaSurtidoService'

// V186 — Frisa restock. Lectura directa (RLS: fn.ver); escritura SIEMPRE por
// las funciones de supabase/schema_v186_frisa_restock.sql. Las órdenes de
// taller son órdenes FR normales (create_order_frisa, como en Nueva orden).

const sinCliente = () => ({ data: null, error: new Error('Supabase no está configurado (revisa tu archivo .env).') })

async function tabla(nombre, orden) {
  let q = supabase.from(nombre).select('*')
  if (orden) q = q.order(orden[0], { ascending: orden[1] })
  return q.range(0, 4999)
}

export async function fetchRestockTodo() {
  if (!supabase) return sinCliente()
  const [niv, sl, cp, li, co, cl, pf] = await Promise.all([
    fetchFrisaNiveles(),
    fetchSurtidosYLineas(),
    tabla('frisa_clave_producto'),
    tabla('frisa_restock_ordenes', ['creado_en', false]),
    tabla('frisa_compras', ['creado_en', false]),
    tabla('frisa_compra_lineas'),
    supabase.from('productos_frisa').select('id, codigo, nombre, color, tallas_rango, activo').order('codigo', { ascending: true }),
  ])
  const error = [niv, sl, cp, li, co, cl, pf].find((x) => x.error)?.error
  if (error) return { data: null, error }
  const ids = li.data.map((l) => l.order_id)
  let orders = []
  let etapas = []
  if (ids.length) {
    const [o, e] = await Promise.all([
      supabase.from('orders').select('id, order_number, status, items, producto_frisa_id, frisa_producto, requested_delivery_date, cancelled_at, eliminada_en, created_at').in('id', ids),
      supabase.from('orden_etapas').select('order_id, etapa, estado').in('order_id', ids),
    ])
    if (o.error || e.error) return { data: null, error: o.error || e.error }
    orders = o.data
    etapas = e.data
  }
  return {
    data: {
      config: niv.data.config, productos: niv.data.productos, surtidos: sl.data.surtidos, lineas: sl.data.lineas,
      clavesProducto: cp.data, ligas: li.data, compras: co.data, compraLineas: cl.data, productosFrisa: pf.data, orders, etapas,
    },
    error: null,
  }
}

export async function buscarOrdenPorFolio(folio) {
  if (!supabase) return sinCliente()
  return supabase.from('orders').select('id, order_number, order_type_key, cancelled_at').ilike('order_number', folio.trim()).maybeSingle()
}

const rpc = (fn, args) => (supabase ? supabase.rpc(fn, args) : Promise.resolve(sinCliente()))

export const ligarOrden = (orderId, origen = 'restock') => rpc('frisa_restock_ligar', { p_order_id: orderId, p_origen: origen })
export const desligarOrden = (orderId) => rpc('frisa_restock_desligar', { p_order_id: orderId })
export const subirABodega = (orderId, lineas, notas) => rpc('frisa_restock_ingresar', { p_order_id: orderId, p_lineas: lineas, p_notas: notas || null })
export const crearCompra = ({ proveedor, fechaEsperada, lineas, notas }) =>
  rpc('frisa_compra_crear', { p_proveedor: proveedor, p_fecha_esperada: fechaEsperada || null, p_lineas: lineas, p_notas: notas || null })
export const recibirCompra = (id, lineas, notas) => rpc('frisa_compra_recibir', { p_id: id, p_lineas: lineas, p_notas: notas || null })
export const cancelarCompra = (id, motivo) => rpc('frisa_compra_cancelar', { p_id: id, p_motivo: motivo })
