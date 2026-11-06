import { pdf } from '@react-pdf/renderer'
import FrisaAPedirPdf from '../components/pdf/FrisaAPedirPdf'
import { listaAPedir } from './frisaNiveles'

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function buildFrisaAPedirPdfBlob(filas, cfg) {
  const generado = new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })
  return pdf(<FrisaAPedirPdf lista={listaAPedir(filas)} cfg={cfg} generado={generado} />).toBlob()
}

export const frisaAPedirFileName = (ext) => `SALPER-Frisa-a-pedir-${hoyLocal()}.${ext}`
