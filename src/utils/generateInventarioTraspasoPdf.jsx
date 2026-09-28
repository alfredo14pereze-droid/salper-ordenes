import { pdf } from '@react-pdf/renderer'
import InventarioTraspasoPdf from '../components/pdf/InventarioTraspasoPdf'

export async function buildTraspasoBlob({ traspaso, origenNombre, destinoNombre, lineas }) {
  return pdf(<InventarioTraspasoPdf traspaso={traspaso} origenNombre={origenNombre} destinoNombre={destinoNombre} lineas={lineas} />).toBlob()
}

export function traspasoFileName(traspaso) {
  return `Traspaso-${traspaso.folio}.pdf`
}
