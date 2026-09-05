import { pdf } from '@react-pdf/renderer'
import OrderConfirmationPdf from '../components/pdf/OrderConfirmationPdf'
import RemisionPdf from '../components/pdf/RemisionPdf'

// Genera el blob del PDF de confirmación de una orden (sin descargarlo —
// ver PdfPreviewModal.jsx, que se encarga de mostrarlo y de la descarga
// real cuando el usuario le da al botón de adentro). `variant`: 'interno'
// (todo, incluyendo tiempo estimado de producción — para SALPER) o
// 'cliente' (lo mismo sin el tiempo estimado — para mandarle al
// cliente). `history` es el arreglo de order_status_history de la orden
// (ver fetchOrderHistory) — opcional.
export async function buildOrderConfirmationPdfBlob(order, { orderTypeLabel, variant = 'interno', history = [] } = {}) {
  return pdf(
    <OrderConfirmationPdf order={order} orderTypeLabel={orderTypeLabel} variant={variant} history={history} />
  ).toBlob()
}

// Remisión de entrega (V26, Parte 4) — solo tiene sentido con la orden
// ya completada (compara cantidad pedida vs realmente surtida).
export async function buildRemisionPdfBlob(order, { orderTypeLabel } = {}) {
  return pdf(<RemisionPdf order={order} orderTypeLabel={orderTypeLabel} />).toBlob()
}

export function orderConfirmationPdfFileName(order, variant) {
  const suffix = variant === 'cliente' ? '-cliente' : ''
  return `Orden-${order.order_number}${suffix}.pdf`
}

export function remisionPdfFileName(order) {
  return `Remision-${order.order_number}.pdf`
}

// Dispara la descarga real de un blob ya generado — usado por
// PdfPreviewModal (botón "Descargar" de adentro) y por el único lugar
// donde SÍ seguimos descargando automático sin vista previa: al crear una
// orden nueva (ver NewOrderPage.jsx), porque ahí el PDF es un efecto
// secundario de fondo mientras la página ya está navegando al detalle —
// meter un modal bloqueante ahí en medio sería peor experiencia, no
// mejor. Los botones "Descargar PDF"/"PDF para cliente" del detalle sí
// pasan por la vista previa.
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
