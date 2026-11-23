import { pdf } from '@react-pdf/renderer'
import { AtrFaltantesPdf, AtrHojaSurtidoPdf } from '../components/pdf/AtrSurtidoPdf'
import { formatDate, formatDateTime } from './dates'

// V215 — PDFs de ATR (se muestran en PdfPreviewModal antes de bajar).
const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const limpio = (t) => String(t || '').replace(/[^\w.-]+/g, '_')

export async function buildAtrHojaSurtidoBlob(oc, surtido, resumen) {
  return pdf(<AtrHojaSurtidoPdf oc={oc} surtido={surtido} resumen={resumen} fmt={{ fecha: formatDate, fechaHora: formatDateTime }} />).toBlob()
}
export const atrHojaSurtidoFileName = (oc, surtido) =>
  `SALPER-ATR-surtido-OC-${limpio(oc.numero_oc)}-${String(surtido.fecha || hoyLocal()).slice(0, 10)}.pdf`

export async function buildAtrFaltantesBlob(filas) {
  const generado = new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })
  return pdf(<AtrFaltantesPdf filas={filas} generado={generado} />).toBlob()
}
export const atrFaltantesFileName = (ext) => `SALPER-ATR-que-nos-falta-${hoyLocal()}.${ext}`
