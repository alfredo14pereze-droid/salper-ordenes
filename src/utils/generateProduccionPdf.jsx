import { pdf } from '@react-pdf/renderer'
import { ProduccionOperadorasDoc, ProduccionRankingDoc } from '../components/pdf/ProduccionPdf'

// V70 — devuelven el blob SIN descargar; PdfPreviewModal muestra la vista previa y descarga.
export async function buildProduccionOperadorasPdfBlob(semana, personas) {
  return pdf(<ProduccionOperadorasDoc semana={semana} personas={personas} />).toBlob()
}

export async function buildProduccionRankingPdfBlob(semana, filas) {
  return pdf(<ProduccionRankingDoc semana={semana} filas={filas} />).toBlob()
}

export const produccionPdfFileName = (tipo, semana) => `Produccion-${tipo}-${semana.fecha_fin}.pdf`
