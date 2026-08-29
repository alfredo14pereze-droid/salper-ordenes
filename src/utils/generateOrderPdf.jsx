import { pdf } from '@react-pdf/renderer'
import OrderConfirmationPdf from '../components/pdf/OrderConfirmationPdf'

// Genera el PDF de confirmación de una orden y dispara la descarga en el
// navegador (se usa tanto al crear una orden nueva como desde el botón
// "Descargar PDF" en el detalle). No depende de una vista renderizada: crea
// el documento en memoria con @react-pdf/renderer y lo baja como blob.
export async function downloadOrderConfirmationPdf(order, { orderTypeLabel } = {}) {
  const blob = await pdf(<OrderConfirmationPdf order={order} orderTypeLabel={orderTypeLabel} />).toBlob()
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `Orden-${order.order_number}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}
