// Lector mínimo de .xlsx (la primera hoja) sin dependencias: un .xlsx es un
// ZIP con XML. Usa DecompressionStream('deflate-raw') del navegador (y de
// Node 18+). Regresa la hoja como arreglo de renglones: [[celda, ...], ...]
// con números como Number y textos como String.

const td = new TextDecoder('utf-8')

// Lee el directorio central del ZIP → { nombre: {metodo, inicio, comprimido} }
function entradasZip(buf) {
  const dv = new DataView(buf)
  let fin = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break }
  }
  if (fin < 0) throw new Error('El archivo no es un Excel (.xlsx) válido.')
  const total = dv.getUint16(fin + 10, true)
  let p = dv.getUint32(fin + 16, true)
  const out = {}
  for (let k = 0; k < total; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const metodo = dv.getUint16(p + 10, true)
    const comprimido = dv.getUint32(p + 20, true)
    const largoNombre = dv.getUint16(p + 28, true)
    const largoExtra = dv.getUint16(p + 30, true)
    const largoComent = dv.getUint16(p + 32, true)
    const local = dv.getUint32(p + 42, true)
    const nombre = td.decode(new Uint8Array(buf, p + 46, largoNombre))
    const inicio = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
    out[nombre] = { metodo, inicio, comprimido }
    p += 46 + largoNombre + largoExtra + largoComent
  }
  return out
}

async function leerEntrada(buf, e) {
  const datos = new Uint8Array(buf, e.inicio, e.comprimido)
  if (e.metodo === 0) return td.decode(datos)
  if (e.metodo !== 8) throw new Error('Formato de compresión no soportado en el Excel.')
  const stream = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return td.decode(await new Response(stream).arrayBuffer())
}

const desescapar = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&')

// Texto de un <si> o <is>: junta todos los <t> (también los de texto con formato <r>).
const textoDe = (xml) => desescapar([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))

function columna(ref) {
  const letras = ref.replace(/\d+/g, '')
  let n = 0
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export async function leerXlsx(arrayBuffer) {
  const zip = entradasZip(arrayBuffer)
  const hoja = zip['xl/worksheets/sheet1.xml'] || Object.entries(zip).find(([k]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))?.[1]
  if (!hoja) throw new Error('El Excel no tiene hojas.')
  const compartidos = zip['xl/sharedStrings.xml']
    ? [...(await leerEntrada(arrayBuffer, zip['xl/sharedStrings.xml'])).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]))
    : []
  const xml = await leerEntrada(arrayBuffer, hoja)
  const filas = []
  for (const fila of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const celdas = []
    for (const c of (fila[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1]
      const tipo = (attrs.match(/\bt="(\w+)"/) || [])[1]
      const cuerpo = c[2] || ''
      const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1]
      let valor = null
      if (tipo === 's') valor = compartidos[Number(v)] ?? ''
      else if (tipo === 'inlineStr') valor = textoDe(cuerpo)
      else if (tipo === 'str' || tipo === 'e') valor = v != null ? desescapar(v) : null
      else if (tipo === 'b') valor = v === '1'
      else if (v != null) valor = Number(v)
      const i = ref ? columna(ref) : celdas.length
      celdas[i] = valor
    }
    filas.push(Array.from(celdas, (x) => (x === undefined ? null : x)))
  }
  return filas
}
