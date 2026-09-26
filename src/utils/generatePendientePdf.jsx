import { pdf } from '@react-pdf/renderer'
import PendienteEtiquetaPdf from '../components/pdf/PendienteEtiquetaPdf'

export async function buildEtiquetaBlob(p) {
  return pdf(<PendienteEtiquetaPdf p={p} />).toBlob()
}

export function etiquetaFileName(p) {
  return `Etiqueta-${p.folio}.pdf`
}
