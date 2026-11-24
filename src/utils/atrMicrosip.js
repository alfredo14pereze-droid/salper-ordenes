// V220 — Revisión Microsip: lee el reporte "Existencia y valor del inventario"
// de Microsip (un artículo por renglón: "BATA C/BOLSA ATR AZUL CIELO T-2XL",
// unidad, existencia…) y lo compara contra la existencia de la página por
// bata y talla. Sin dependencias; pruebas en atrMicrosip.test.js.
import { colorDelCatalogo, leerDescripcionAtr, normalizar } from './atrCarga.js'

const esArticulo = (v) => typeof v === 'string' && /^\s*batas?\b/i.test(v) && /(bolsa|atr)/i.test(v)
const esNumero = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v))

// hojas: [{ nombre, filas: [[celdas]] }] (o una sola lista de filas).
// Por renglón toma el PRIMER artículo y el primer número que le sigue (la
// existencia). Si el reporte trae otro reporte al lado (p. ej. "Pendientes
// de surtir"), ese se ignora.
export function leerReporteMicrosip(hojas) {
  const lista = Array.isArray(hojas) && hojas.length && Array.isArray(hojas[0]) ? [{ nombre: 'Hoja1', filas: hojas }] : hojas || []
  const out = []
  for (const h of lista) {
    for (const fila of h.filas || []) {
      const i = (fila || []).findIndex(esArticulo)
      if (i < 0) continue
      let cant = null
      for (let k = i + 1; k < fila.length; k++) {
        if (esArticulo(fila[k])) { if (cant === null) continue; else break }
        if (esNumero(fila[k])) { cant = Number(fila[k]); break }
      }
      if (cant === null) continue
      out.push({ texto: String(fila[i]).trim(), cantidad: cant })
    }
  }
  return out
}

// Liga cada artículo con su bata y talla y lo compara contra la página.
// productos: catálogo de ATR (id, nombre, color, con_bolsa);
// existencias: filas de atr_existencias (producto_id, talla, existencia).
// Regresa { filas: [{producto, talla, microsip, pagina, diferencia}], sinLigar: [{texto, cantidad}] }
export function compararMicrosip(articulos, productos, existencias) {
  const porClave = new Map()
  const sinLigar = []
  const llave = (id, t) => `${id}|${t}`
  for (const a of articulos) {
    const { bolsa, talla, color } = leerDescripcionAtr(a.texto)
    const col = colorDelCatalogo(color, productos)
    const p = col && bolsa !== null ? productos.find((x) => !!x.con_bolsa === bolsa && normalizar(x.color) === col) : null
    if (!p || !talla) { sinLigar.push(a); continue }
    const k = llave(p.id, talla)
    const r = porClave.get(k) || { producto: p, talla, microsip: 0, pagina: 0 }
    r.microsip += a.cantidad
    porClave.set(k, r)
  }
  const porId = new Map(productos.map((p) => [p.id, p]))
  for (const e of existencias || []) {
    const p = porId.get(e.producto_id)
    if (!p) continue
    const k = llave(p.id, e.talla)
    const r = porClave.get(k) || { producto: p, talla: e.talla, microsip: 0, pagina: 0 }
    r.pagina += e.existencia
    porClave.set(k, r)
  }
  const filas = [...porClave.values()]
    .filter((r) => r.microsip !== 0 || r.pagina !== 0)
    .map((r) => ({ ...r, diferencia: r.pagina - r.microsip }))
  return { filas, sinLigar }
}
