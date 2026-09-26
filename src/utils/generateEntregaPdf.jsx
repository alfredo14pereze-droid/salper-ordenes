import { pdf } from '@react-pdf/renderer'
import EntregaResumenPdf from '../components/pdf/EntregaResumenPdf'

// Resumen de entrega (V77): recibe lo que regresa orden_resumen_entrega.
export async function buildEntregaPdfBlob(data) {
  return pdf(<EntregaResumenPdf data={data} />).toBlob()
}

export function entregaPdfFileName(order) {
  return `Entrega-${order.order_number}.pdf`
}
