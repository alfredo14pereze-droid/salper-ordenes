import { pdf } from '@react-pdf/renderer'
import InventarioReportePdf from '../components/pdf/InventarioReportePdf'

export async function buildReporteBlob({ seccionNombre, prendaFiltro, fecha, filas, modo, ubicaciones, ubicacionSeleccionada }) {
  return pdf(
    <InventarioReportePdf
      seccionNombre={seccionNombre}
      prendaFiltro={prendaFiltro}
      fecha={fecha}
      filas={filas}
      modo={modo}
      ubicaciones={ubicaciones}
      ubicacionSeleccionada={ubicacionSeleccionada}
    />
  ).toBlob()
}

export function reporteFileName(seccionNombre, prendaFiltro, fecha) {
  const d = new Date(fecha)
  const stamp = Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
  const base = `Reporte-${seccionNombre}${prendaFiltro ? `-${prendaFiltro}` : ''}-${stamp}`
  return `${base.replace(/\s+/g, '-')}.pdf`
}
