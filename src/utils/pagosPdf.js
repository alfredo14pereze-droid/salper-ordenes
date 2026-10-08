// Totales y anticipo para el PDF de la orden. `totales` es lo que regresa
// orden_totales (V77). Si la orden tiene precios por prenda, mandan esos
// (con IVA desglosado cuando pide factura); si no, el total capturado a mano
// (orders.total_orden, V42). Sin total ni anticipos regresa null y el PDF no
// muestra la sección.
export function resumenPagosPdf(order, totales) {
  const anticipos = Number(totales?.anticipos) || 0
  const conPrecios = (totales?.renglones || []).length > 0
  const total = conPrecios ? Number(totales.total) || 0 : Number(order?.total_orden) || 0
  if (total <= 0 && anticipos <= 0) return null
  const desglosaIva = conPrecios && !!totales.requiere_factura
  return {
    subtotal: desglosaIva ? Number(totales.subtotal) || 0 : null,
    iva: desglosaIva ? Number(totales.iva) || 0 : null,
    total: total > 0 ? total : null,
    anticipos,
    saldo: total > 0 ? Math.round((total - anticipos) * 100) / 100 : null,
  }
}

// Filas del roster de una prenda (nombre, talla y número) que sí traen datos.
export function rosterParaPdf(item) {
  if (!item?.tiene_roster || !Array.isArray(item.roster)) return []
  return item.roster.filter((r) => String(r?.nombre ?? '').trim() || String(r?.numero ?? '').trim())
}

// Bordados (tipo 'bordado') o impresiones (tipo 'impresion') de una prenda
// que van al PDF: solo si la prenda los lleva y traen foto o lugar.
export function marcasDePrenda(item, tipo) {
  const lleva = tipo === 'bordado' ? item?.lleva_bordado : item?.lleva_impresion
  const lista = tipo === 'bordado' ? item?.bordados : item?.impresiones
  if (!lleva || !Array.isArray(lista)) return []
  return lista.filter((m) => m && (m.foto_url || String(m.ubicacion ?? '').trim()))
}
