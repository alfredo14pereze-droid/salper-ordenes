// V92 — formatea una talla para mostrarla en pantalla/PDF con el prefijo
// "T." (ej. "T.10", "T.0 TALL", "T.1(20)") cuando el nombre es puramente
// numérico — para no confundirla con una cantidad. Las tallas de letra
// (XS, CH, M, L, XL, 2XL…) y "Sin talla" se quedan igual. Es solo
// presentación: en la base de datos (inv_tallas.nombre) sigue sin el
// prefijo, tal como se normalizó en la importación (V89).
const NUMERIC_TALLA_RE = /^\d+(\s*TALL)?$/i
const PAREN_TALLA_RE = /^\d+\(\d+\)$/

export function formatTalla(nombre) {
  if (!nombre) return nombre
  const t = nombre.trim()
  if (NUMERIC_TALLA_RE.test(t) || PAREN_TALLA_RE.test(t)) {
    return `T.${t}`
  }
  return nombre
}
