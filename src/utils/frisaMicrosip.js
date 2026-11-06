// V188 — Revisión contra Microsip. Lee el reporte "Existencia y valor del
// inventario" (Excel o CSV), liga cada artículo con su clave y compara.
import { parseCSV, numeroCSV } from './frisaNiveles.js'

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

// filas: arreglo de renglones (de leerXlsx o de parseCSV).
// Artículo = renglón con código en la 1ª columna, nombre en la 2ª y existencia numérica en la 3ª
// (se saltan encabezados, "Total 63 artículos", "1 artículos sin existencia").
export function articulosDeFilas(filas) {
  const out = []
  for (const f of filas || []) {
    const codigo = String(f?.[0] ?? '').trim()
    const nombre = String(f?.[1] ?? '').trim()
    const ex = typeof f?.[2] === 'number' ? f[2] : numeroCSV(f?.[2])
    if (!codigo || !nombre || ex == null || !Number.isFinite(ex)) continue
    if (/^total\b/i.test(codigo) || /^art[ií]culo$/i.test(codigo)) continue
    out.push({ codigo, nombre, existencia: Math.round(ex) })
  }
  return out
}

export const articulosDeCSV = (texto) => articulosDeFilas(parseCSV(texto))

// "Total 63 artículos … 3717" del reporte, para comprobar que se leyó todo.
export function totalDelReporte(filas) {
  for (const f of filas || []) {
    const m = String(f?.[0] ?? '').match(/^total\s+(\d+)\s+art/i)
    if (m) return { articulos: Number(m[1]), piezas: typeof f[2] === 'number' ? f[2] : numeroCSV(f[2]) }
  }
  return null
}

// Fecha que trae el reporte ("Al 31 de diciembre del 2026") → 'yyyy-mm-dd' o null.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function fechaDelReporte(filas) {
  for (const f of (filas || []).slice(0, 10)) {
    const m = String(f?.[0] ?? '').toLowerCase().match(/al\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+del?\s+(\d{4})/)
    if (m) {
      const mes = MESES.indexOf(m[2].normalize('NFD').replace(/[̀-ͯ]/g, ''))
      if (mes >= 0) return `${m[3]}-${String(mes + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
    }
  }
  return null
}

// productos: claves con stock_actual; codigos: [{codigo, producto_id}] aprendidos.
// Liga por: código aprendido → la clave misma → el nombre (sin acentos ni espacios de más).
export function ligarMicrosip(articulos, productos, codigos = []) {
  const porId = new Map(productos.map((p) => [p.id, p]))
  const porClave = new Map(productos.map((p) => [norm(p.clave), p]))
  const porNombre = new Map(productos.map((p) => [norm(p.nombre), p]))
  const porCodigo = new Map(codigos.map((c) => [norm(c.codigo), porId.get(c.producto_id)]).filter(([, p]) => p))
  const usados = new Set()
  const lineas = []
  const sinLigar = []
  for (const a of articulos) {
    let p = porCodigo.get(norm(a.codigo)), como = 'aprendido'
    if (!p) { p = porClave.get(norm(a.codigo)); como = 'clave' }
    if (!p) { p = porNombre.get(norm(a.nombre)); como = 'nombre' }
    if (!p || usados.has(p.id)) { sinLigar.push(a); continue }
    usados.add(p.id)
    const pagina = Number(p.stock_actual) || 0
    lineas.push({ producto: p, codigo: a.codigo, nombreMicrosip: a.nombre, microsip: a.existencia, pagina, diferencia: a.existencia - pagina, como })
  }
  const faltan = productos.filter((p) => !usados.has(p.id))
  lineas.sort((x, y) => Math.abs(y.diferencia) - Math.abs(x.diferencia) || x.producto.clave.localeCompare(y.producto.clave))
  return { lineas, sinLigar, faltan }
}

// Días desde la última revisión (para el aviso de "cada 10 días").
export function diasDesde(fechaISO, hoy = new Date()) {
  if (!fechaISO) return null
  const a = new Date(String(fechaISO).slice(0, 10) + 'T12:00:00')
  const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12)
  return Math.round((b - a) / 86400000)
}
