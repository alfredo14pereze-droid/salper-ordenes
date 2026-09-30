import { pdf } from '@react-pdf/renderer'
import {
  ProduccionOperadorasDoc,
  ProduccionRankingDoc,
  CatalogoOperacionesDoc,
  CatalogoOperadorasDoc,
  CatalogoReglasDoc,
} from '../components/pdf/ProduccionPdf'

// V70 — devuelven el blob SIN descargar; PdfPreviewModal muestra la vista previa y descarga.
export async function buildProduccionOperadorasPdfBlob(semana, personas) {
  return pdf(<ProduccionOperadorasDoc semana={semana} personas={personas} />).toBlob()
}

export async function buildProduccionRankingPdfBlob(semana, filas) {
  return pdf(<ProduccionRankingDoc semana={semana} filas={filas} />).toBlob()
}

export const produccionPdfFileName = (tipo, semana) => `Produccion-${tipo}-${semana.fecha_fin}.pdf`

// V109 — catálogos imprimibles de Admin producción (Operaciones/
// Operadoras/Reglas), sin relación con una semana en particular.
export async function buildCatalogoOperacionesPdfBlob(operaciones) {
  return pdf(<CatalogoOperacionesDoc operaciones={operaciones} />).toBlob()
}

export async function buildCatalogoOperadorasPdfBlob(operadoras) {
  return pdf(<CatalogoOperadorasDoc operadoras={operadoras} />).toBlob()
}

export async function buildCatalogoReglasPdfBlob(reglas) {
  return pdf(<CatalogoReglasDoc reglas={reglas} />).toBlob()
}

const hoyArchivo = () => toStr(new Date())
function toStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const catalogoPdfFileName = (tipo) => `Produccion-catalogo-${tipo}-${hoyArchivo()}.pdf`
