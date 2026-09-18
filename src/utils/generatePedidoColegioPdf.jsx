import { pdf } from '@react-pdf/renderer'
import PedidoColegioPdf from '../components/pdf/PedidoColegioPdf'

// V57 — recibo de un Pedido Colegio (una hoja con el recibo duplicado, para
// cortar a la mitad). Devuelve el blob sin descargarlo — el
// PdfPreviewModal se encarga de la vista previa y de la descarga real.
// `pedido`: lo que regresa fetchPedidoById (pedido + colegio + articulos +
// abonos).
export async function buildPedidoColegioPdfBlob(pedido) {
  return pdf(<PedidoColegioPdf pedido={pedido} />).toBlob()
}

export function pedidoColegioPdfFileName(pedido) {
  return `Pedido-${pedido.folio}.pdf`
}
