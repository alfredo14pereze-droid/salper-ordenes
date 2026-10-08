import { pdf } from '@react-pdf/renderer'
import OrderConfirmationPdf from '../components/pdf/OrderConfirmationPdf'
import RemisionPdf from '../components/pdf/RemisionPdf'
import { fetchOrdenTotales } from '../services/finanzasService'
import { marcasDePrenda, resumenPagosPdf } from './pagosPdf'

// Genera el blob del PDF de confirmación de una orden (sin descargarlo —
// ver PdfPreviewModal.jsx, que se encarga de mostrarlo y de la descarga
// real cuando el usuario le da al botón de adentro). `variant`: 'interno'
// (todo, incluyendo tiempo estimado de producción — para SALPER) o
// 'cliente' (lo mismo sin el tiempo estimado — para mandarle al
// cliente). `history` es el arreglo de order_status_history de la orden
// (ver fetchOrderHistory) — opcional. `pagos` (ver fetchPagosParaPdf) agrega
// la sección "Total y anticipo"; sin él, el PDF sale sin dinero. Las fotos de
// referencia de la orden se incluyen solas (ver prepararFotosParaPdf).
export async function buildOrderConfirmationPdfBlob(order, { orderTypeLabel, variant = 'interno', history = [], pagos = null } = {}) {
  const [fotos, fotosPrendas] = await Promise.all([prepararFotosParaPdf(order), prepararFotosDePrendasParaPdf(order)])
  return pdf(
    <OrderConfirmationPdf
      order={order}
      orderTypeLabel={orderTypeLabel}
      variant={variant}
      history={history}
      pagos={pagos}
      fotos={fotos}
      fotosPrendas={fotosPrendas}
    />
  ).toBlob()
}

// Fotos de referencia de la orden, listas para el PDF. El PDF solo acepta
// JPG/PNG y las fotos pueden venir en cualquier formato (webp del celular,
// por ejemplo) y muy pesadas: cada una se baja, se reduce (lado mayor de
// 1400 px) y se convierte a JPG aquí. La que no se pueda leer se omite: el
// PDF sale con las demás.
const FOTO_PDF_LADO_MAX = 1400

async function fotoParaPdf(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const bitmap = await createImageBitmap(await res.blob())
  const escala = Math.min(1, FOTO_PDF_LADO_MAX / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * escala))
  const height = Math.max(1, Math.round(bitmap.height * escala))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // Fondo blanco: un PNG con transparencia saldría negro al pasar a JPG.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  return { src: canvas.toDataURL('image/jpeg', 0.85), width, height }
}

function fotoParaPdfSegura(url) {
  return fotoParaPdf(url).catch((err) => {
    console.error('No se pudo incluir una foto en el PDF:', url, err)
    return null
  })
}

export async function prepararFotosParaPdf(order) {
  const urls = (order?.reference_photos || []).map((f) => f?.url).filter(Boolean)
  return (await Promise.all(urls.map(fotoParaPdfSegura))).filter(Boolean)
}

// Fotos de los bordados e impresiones de cada prenda (items[].bordados /
// items[].impresiones): regresa { [url original]: foto lista para el PDF }.
// El PDF busca ahí cada foto por su url; la que no se pudo leer no está.
export async function prepararFotosDePrendasParaPdf(order) {
  const urls = [
    ...new Set(
      (order?.items || [])
        .flatMap((item) => [...urlsDeMarcas(item, 'bordado'), ...urlsDeMarcas(item, 'impresion')])
        .filter(Boolean)
    ),
  ]
  const listas = await Promise.all(urls.map(fotoParaPdfSegura))
  return Object.fromEntries(urls.map((url, i) => [url, listas[i]]).filter(([, foto]) => foto))
}

function urlsDeMarcas(item, tipo) {
  return marcasDePrenda(item, tipo).map((m) => m.foto_url)
}

// Total, anticipos y restante de la orden para su PDF. Llamar solo si el
// usuario puede ver dinero (canViewFinanzas): orden_totales rechaza a los
// demás. Si la consulta falla, el PDF se genera sin la sección.
export async function fetchPagosParaPdf(order) {
  const { data, error } = await fetchOrdenTotales(order.id)
  if (error) {
    console.error('No se pudieron leer los totales para el PDF:', error)
    return resumenPagosPdf(order, null)
  }
  return resumenPagosPdf(order, data)
}

// Remisión de entrega (V26, Parte 4) — solo tiene sentido con la orden
// ya completada (compara cantidad pedida vs realmente surtida).
export async function buildRemisionPdfBlob(order, { orderTypeLabel } = {}) {
  return pdf(<RemisionPdf order={order} orderTypeLabel={orderTypeLabel} />).toBlob()
}

export function orderConfirmationPdfFileName(order, variant) {
  const suffix = variant === 'cliente' ? '-cliente' : ''
  return `Orden-${order.order_number}${suffix}.pdf`
}

export function remisionPdfFileName(order) {
  return `Remision-${order.order_number}.pdf`
}

// Dispara la descarga real de un blob ya generado — usado por
// PdfPreviewModal (botón "Descargar" de adentro) y por el único lugar
// donde SÍ seguimos descargando automático sin vista previa: al crear una
// orden nueva (ver NewOrderPage.jsx), porque ahí el PDF es un efecto
// secundario de fondo mientras la página ya está navegando al detalle —
// meter un modal bloqueante ahí en medio sería peor experiencia, no
// mejor. Los botones "Descargar PDF"/"PDF para cliente" del detalle sí
// pasan por la vista previa.
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
