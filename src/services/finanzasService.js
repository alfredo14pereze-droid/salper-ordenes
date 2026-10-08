import { supabase } from '../lib/supabaseClient'

// V77 — precios, facturación y razones sociales. Todo el cálculo (subtotal,
// IVA, total, saldo, qué falta) vive en Supabase (orden_totales); aquí solo
// se pide y se muestra. Ver supabase/schema_v77_precios_facturacion.sql.

function ensureClient() {
  if (!supabase) return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  return { error: null }
}

export const REGIMENES_FISCALES = [
  '601 · General de Ley Personas Morales',
  '603 · Personas Morales con Fines no Lucrativos',
  '605 · Sueldos y Salarios e Ingresos Asimilados a Salarios',
  '606 · Arrendamiento',
  '612 · Personas Físicas con Actividades Empresariales y Profesionales',
  '616 · Sin obligaciones fiscales',
  '621 · Incorporación Fiscal',
  '625 · Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
  '626 · Régimen Simplificado de Confianza (RESICO)',
]

export const USOS_CFDI = [
  'G01 · Adquisición de mercancías',
  'G02 · Devoluciones, descuentos o bonificaciones',
  'G03 · Gastos en general',
  'I01 · Construcciones',
  'I04 · Equipo de cómputo y accesorios',
  'S01 · Sin efectos fiscales',
  'CP01 · Pagos',
]

export async function fetchRazonesSociales(clienteId) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase
    .from('cliente_razones_sociales')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('activa', true)
    .order('predeterminada', { ascending: false })
    .order('razon_social', { ascending: true })
}

export async function guardarRazonSocial({ id = null, clienteId, razonSocial, rfc, regimen, cp, usoCfdi, correo, predeterminada, activa = true }) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase
    .rpc('guardar_razon_social', {
      p_id: id,
      p_cliente_id: clienteId,
      p_razon_social: razonSocial,
      p_rfc: rfc,
      p_regimen: regimen,
      p_cp: cp,
      p_uso_cfdi: usoCfdi,
      p_correo: correo || null,
      p_predeterminada: !!predeterminada,
      p_activa: activa,
    })
    .single()
}

export async function fetchOrdenPrecios(orderId) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.from('orden_precios').select('*').eq('order_id', orderId).order('item_index', { ascending: true })
}

export async function fetchOrdenFacturacion(orderId) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.from('orden_facturacion').select('*').eq('order_id', orderId).maybeSingle()
}

export async function setOrdenPrecios(orderId, renglones) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.rpc('set_orden_precios', { p_order_id: orderId, p_renglones: renglones })
}

export async function setOrdenFacturacion({ orderId, requiere, incluyeIva, razonSocialId }) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.rpc('set_orden_facturacion', {
    p_order_id: orderId,
    p_requiere: requiere,
    p_incluye_iva: incluyeIva,
    p_razon_social_id: razonSocialId || null,
  })
}

// V144 — orden de un cliente NO registrado (sin client_id): los datos
// fiscales se capturan a mano y viven en la orden. Pueden ir vacíos al
// marcar la factura; se exigen completos para entregar.
export async function setOrdenFacturacionManual({ orderId, requiere, incluyeIva, fiscal }) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.rpc('set_orden_facturacion_manual', {
    p_order_id: orderId,
    p_requiere: requiere,
    p_incluye_iva: incluyeIva,
    p_fiscal: fiscal || null,
  })
}

export async function fetchOrdenTotales(orderId) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.rpc('orden_totales', { p_order_id: orderId })
}

export async function fetchUltimoPrecio(clienteId, prenda) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.rpc('ultimo_precio_cliente_prenda', { p_cliente_id: clienteId, p_prenda: prenda })
}

export async function fetchResumenEntrega(orderId) {
  const { error } = ensureClient()
  if (error) return { data: null, error }
  return supabase.rpc('orden_resumen_entrega', { p_order_id: orderId })
}

export function formatMxn(n) {
  return Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}
