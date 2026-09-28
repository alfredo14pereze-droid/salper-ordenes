import { pdf } from '@react-pdf/renderer'
import InventarioConteoPdf from '../components/pdf/InventarioConteoPdf'

export async function buildConteoBlob({ seccionNombre, ubicacionNombre, fecha, lineas }) {
  return pdf(<InventarioConteoPdf seccionNombre={seccionNombre} ubicacionNombre={ubicacionNombre} fecha={fecha} lineas={lineas} />).toBlob()
}

export function conteoFileName(seccionNombre, fecha) {
  const d = new Date(fecha)
  const stamp = Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
  return `Inventario-${seccionNombre}-${stamp}.pdf`
}
