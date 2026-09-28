import { pdf } from '@react-pdf/renderer'
import InventarioReportePdf from '../components/pdf/InventarioReportePdf'

export async function buildReporteBlob({ seccionNombre, subtitulo, fecha, filas, modo, ubicaciones, ubicacionSeleccionada }) {
  return pdf(
    <InventarioReportePdf
      seccionNombre={seccionNombre}
      subtitulo={subtitulo}
      fecha={fecha}
      filas={filas}
      modo={modo}
      ubicaciones={ubicaciones}
      ubicacionSeleccionada={ubicacionSeleccionada}
    />
  ).toBlob()
}

// prendasFiltro: null (todas), o el arreglo de nombres elegidos con checks.
export function reporteFileName(seccionNombre, prendasFiltro, fecha) {
  const d = new Date(fecha)
  const stamp = Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
  let sufijo = ''
  if (prendasFiltro) {
    sufijo = prendasFiltro.length === 1 ? `-${prendasFiltro[0]}` : `-${prendasFiltro.length}-prendas`
  }
  const base = `Reporte-${seccionNombre}${sufijo}-${stamp}`
  return `${base.replace(/\s+/g, '-')}.pdf`
}
