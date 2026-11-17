import { supabase } from '../lib/supabaseClient'

// V209/V210 — Inventario de batas de ATR. Lectura directa (RLS: atr.ver);
// escritura solo por RPC atr_* — ver supabase/schema_v210_atr_movimientos_rpc.sql.
// Existencia = suma de movimientos (vista atr_existencias).

function sinCliente() {
  return supabase ? null : new Error('Supabase no está configurado (revisa tu archivo .env).')
}

async function todas(armar) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999)
    if (error) return { data: null, error }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return { data: out, error: null }
}

// Batas del catálogo de ATR (cliente con nombre "ATR").
export async function fetchAtrProductos() {
  const e = sinCliente()
  if (e) return { data: null, error: e }
  const { data: cli, error } = await supabase.from('clientes').select('id').ilike('nombre', 'atr').maybeSingle()
  if (error) return { data: null, error }
  if (!cli) return { data: null, error: new Error('No existe el cliente ATR.') }
  const r = await supabase
    .from('productos')
    .select('id, nombre, color, tallas, especificaciones')
    .eq('cliente_id', cli.id)
    .order('nombre')
  if (r.error) return r
  return {
    data: r.data.map((p) => ({ ...p, con_bolsa: !!p.especificaciones?.bolsa })),
    error: null,
  }
}

export async function fetchAtrExistencias() {
  const e = sinCliente()
  if (e) return { data: null, error: e }
  return todas(() => supabase.from('atr_existencias').select('*').order('producto').order('talla'))
}

export async function fetchAtrHayCargaInicial() {
  const e = sinCliente()
  if (e) return { data: null, error: e }
  const { data, error } = await supabase
    .from('atr_movimientos')
    .select('id, fecha_corte, creado_en, usuario_nombre')
    .eq('tipo', 'carga_inicial')
    .order('creado_en', { ascending: false })
    .limit(1)
  if (error) return { data: null, error }
  return { data: data[0] || null, error: null }
}

// Historial de una línea (producto + talla), con el folio de la orden si aplica.
export async function fetchAtrHistorial(productoId, talla) {
  const e = sinCliente()
  if (e) return { data: null, error: e }
  const r = await todas(() =>
    supabase
      .from('atr_movimientos')
      .select('*')
      .eq('producto_id', productoId)
      .eq('talla', talla)
      .order('creado_en', { ascending: false })
      .order('id', { ascending: false }),
  )
  if (r.error) return r
  const ids = [...new Set(r.data.map((m) => m.order_id).filter(Boolean))]
  let folios = {}
  if (ids.length) {
    const o = await supabase.from('orders').select('id, order_number').in('id', ids)
    if (!o.error) folios = Object.fromEntries(o.data.map((x) => [x.id, x.order_number]))
  }
  return { data: r.data.map((m) => ({ ...m, folio: m.order_id ? folios[m.order_id] || null : null })), error: null }
}

// lineas: [{ producto_id, talla, cantidad }]
export async function cargarInicialAtr(fechaCorte, lineas, otraCarga = false) {
  const e = sinCliente()
  if (e) return { data: null, error: e }
  return supabase.rpc('atr_cargar_inicial', { p_fecha_corte: fechaCorte, p_lineas: lineas, p_otra_carga: otraCarga })
}

export async function registrarEntregaAtr(lineas, nota, permitirNegativo = false) {
  const e = sinCliente()
  if (e) return { data: null, error: e }
  return supabase.rpc('atr_registrar_entrega', { p_lineas: lineas, p_nota: nota || null, p_permitir_negativo: permitirNegativo })
}

export async function registrarAjusteAtr(productoId, talla, cantidad, nota) {
  const e = sinCliente()
  if (e) return { data: null, error: e }
  return supabase.rpc('atr_registrar_ajuste', { p_producto_id: productoId, p_talla: talla, p_cantidad: cantidad, p_nota: nota })
}

export async function crearProductoAtr(conBolsa, color) {
  const e = sinCliente()
  if (e) return { data: null, error: e }
  return supabase.rpc('atr_crear_producto', { p_con_bolsa: conBolsa, p_color: color })
}

// V211 — ¿la orden es de ATR y ya se sumó al inventario? (cualquier sesión)
export async function fetchAtrEstadoOrden(orderId) {
  const e = sinCliente()
  if (e) return { data: null, error: e }
  const { data, error } = await supabase.rpc('atr_estado_orden', { p_order_id: orderId })
  if (error) return { data: null, error }
  return { data: Array.isArray(data) ? data[0] || null : data, error: null }
}
