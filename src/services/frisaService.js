import { supabase } from '../lib/supabaseClient'
import { limpiarFolioExterno, leerFolioSalper, variantesFolioSalper } from '../utils/folioExterno'

// V155 — catálogo de productos de Frisa y órdenes Frisa (ver
// schema_v155_frisa_productos.sql). Lectura directa; escritura solo por RPC.

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// Productos con su secuencia: [{…producto, procesos: [{proceso, orden, impresiones, notas}]}].
export async function fetchProductosFrisa() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  const { data, error } = await supabase
    .from('productos_frisa')
    .select('*, producto_frisa_procesos(proceso_codigo, orden, impresiones, notas)')
    .order('codigo', { ascending: true })
  if (error) return { data: null, error }
  return {
    data: (data || []).map(({ producto_frisa_procesos: pasos, ...p }) => ({
      ...p,
      procesos: (pasos || [])
        .map((x) => ({ proceso: x.proceso_codigo, orden: x.orden, impresiones: x.impresiones, notas: x.notas }))
        .sort((a, b) => a.orden - b.orden),
    })),
    error: null,
  }
}

// Alta (sin id) o edición, con la secuencia completa en el orden de la lista.
export async function guardarProductoFrisa({ id, codigo, nombre, origen, tallasRango, color, tela, proveedor, descripcion, activo, procesos }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('guardar_producto_frisa', {
      p_id: id || null,
      p_codigo: codigo,
      p_nombre: nombre,
      p_origen: origen,
      p_tallas_rango: tallasRango || null,
      p_color: color || null,
      p_tela: tela || null,
      p_proveedor: proveedor || null,
      p_descripcion: descripcion || null,
      p_activo: activo !== false,
      p_procesos: procesos || [],
    })
    .single()
}

// El servidor copia la secuencia del producto a la orden (etapas y
// orders.frisa_producto); el cliente es "Frisa" y no lleva precio.
export async function createOrderFrisa({ productoId, requestedDeliveryDate, items, description, foliosExternos, llevaBordado }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_order_frisa', {
      p_producto_id: productoId,
      p_requested_delivery_date: requestedDeliveryDate,
      p_items: items || [],
      p_description: description || null,
      p_folios_externos: foliosExternos || [],
      p_lleva_bordado: !!llevaBordado,
    })
    .single()
}

// V218 — folio externo (folio de nuestro control interno) de una orden Frisa.
// Vacío lo quita. Se guarda sin espacios al inicio ni al final.
export async function setFolioExternoFrisa(orderId, folio) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('frisa_set_folio_externo', { p_order_id: orderId, p_folio: limpiarFolioExterno(folio) }).single()
}

// ¿El folio capturado es el folio de una orden de SALPER? (solo avisa).
export async function buscarOrdenSalperPorFolio(texto, excluirId = null) {
  const cand = leerFolioSalper(texto)
  if (!cand || !supabase) return { data: null, error: null }
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, client_name, eliminada_en, cancelled_at')
    .in('order_number', variantesFolioSalper(cand))
    .limit(5)
  if (error) return { data: null, error }
  return { data: (data || []).find((o) => o.id !== excluirId) || null, error: null }
}

// V218 — órdenes Frisa para buscar por folio FR o folio externo (módulo Frisa).
// Son pocas (decenas): se traen todas las no eliminadas y se filtra en pantalla.
export async function fetchOrdenesFrisaParaBuscar() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .from('orders')
    .select('id, order_number, folio_externo, status, items, frisa_producto, requested_delivery_date, cancelled_at, created_at')
    .eq('order_type_key', 'frisa')
    .is('eliminada_en', null)
    .order('created_at', { ascending: false })
    .range(0, 1999)
}
