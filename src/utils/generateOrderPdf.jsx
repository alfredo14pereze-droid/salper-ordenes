import { pdf } from '@react-pdf/renderer'
import OrderConfirmationPdf from '../components/pdf/OrderConfirmationPdf'

// Genera el PDF de confirmación de una orden y dispara la descarga en el
// navegador (se usa tanto al crear una orden nueva como desde los botones
// "Descargar PDF" del detalle). No depende de una vista renderizada: crea
// el documento en memoria con @react-pdf/renderer y lo baja como blob.
//
// `variant`: 'interno' (todo, incluyendo tiempo estimado de producción —
// para SALPER) o 'cliente' (lo mismo sin el tiempo estimado — para
// mandarle al cliente). Ver OrderConfirmationPdf.
export async function downloadOrderConfirmationPdf(order, { orderTypeLabel, variant = 'interno' } = {}) {
  const blob = await pdf(
    <OrderConfirmationPdf order={order} orderTypeLabel={orderTypeLabel} variant={variant} />
  ).toBlob()
  const url = URL.createObjectURL(blob)

  const suffix = variant === 'cliente' ? '-cliente' : ''
  const link = document.createElement('a')
  link.href = url
  link.download = `Orden-${order.order_number}${suffix}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}
