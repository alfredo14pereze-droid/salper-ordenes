// Todos los campos de archivo aceptan foto o PDF (pedido de Alfredo,
// 2026-10-23). Aquí viven la validación y cómo saber si algo guardado es un
// PDF (por la extensión del path/url, que siempre se guarda al subir).

export const ACEPTA_FOTO_O_PDF = 'image/*,application/pdf'

export function esFotoOPdf(file) {
  return !!file && (file.type?.startsWith('image/') || file.type === 'application/pdf')
}

export function errorSiNoEsFotoOPdf(file) {
  return esFotoOPdf(file) ? null : new Error(`"${file?.name || 'El archivo'}" no es una foto ni un PDF.`)
}

// Extensión para el path en Storage: un PDF siempre termina en .pdf (así se
// reconoce al mostrarlo), aunque el archivo venga sin extensión.
export function extensionDeArchivo(file) {
  if (file?.type === 'application/pdf') return 'pdf'
  const partes = (file?.name || '').split('.')
  if (partes.length > 1) return partes.pop().toLowerCase()
  return file?.type?.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
}

// `x` puede ser una url, un path, un File o un objeto con url/path/foto_url.
export function esPdf(x) {
  if (!x) return false
  if (typeof File !== 'undefined' && x instanceof File) return x.type === 'application/pdf'
  const texto = typeof x === 'string' ? x : x.path || x.foto_path || x.url || x.foto_url || x.name || ''
  return /\.pdf($|[?#])/i.test(texto)
}
