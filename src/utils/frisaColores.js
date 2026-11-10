// Color de cada producto de Frisa (confirmado con Alfredo, 2026-11-10): un color
// ÚNICO por producto, el mismo de las etiquetas de estantería y del cartel de
// bodega (docs/SALPER_Frisa_Guia_Cartel.pdf). La franja plateada = lleva reflejante.
// No existe playera marino manga corta lisa, así que no tiene color.
// texto/fondo: el nombre va en negritas del color oscuro sobre el mismo color en claro
// (pedido de Alfredo, 2026-11-10, como los tonos de las playeras del 6-nov).
export const PALETA_FRISA = {
  pmc_ref: { nombre: 'Celeste', hex: '#29B6F6', texto: '#0B5E86', fondo: '#E1F4FD' },
  pml_ref: { nombre: 'Azul rey', hex: '#1E40AF', texto: '#1E3A8A', fondo: '#E0E7FA' },
  pml_lisa: { nombre: 'Marino', hex: '#0B1A33', texto: '#0B1A33', fondo: '#DFE6F4' },
  mango: { nombre: 'Amarillo', hex: '#FFD600', texto: '#7A5600', fondo: '#FFF4BF' },
  verde: { nombre: 'Verde', hex: '#2E7D32', texto: '#1D5C30', fondo: '#DCF2E2' },
  roja: { nombre: 'Rojo', hex: '#C62828', texto: '#9B1C1C', fondo: '#FDE4E1' },
  camisa: { nombre: 'Morado', hex: '#7B1FA2', texto: '#5B1577', fondo: '#F1E1F6' },
  camisa_ni: { nombre: 'Naranja', hex: '#EF6C00', texto: '#8A3D00', fondo: '#FDE9D6' },
  pant: { nombre: 'Café', hex: '#6D4C41', texto: '#4E342E', fondo: '#EFE7E3' },
  pant34: { nombre: 'Rosa fucsia', hex: '#EC407A', texto: '#A3164A', fondo: '#FCE4EE' },
  bolsa: { nombre: 'Gris', hex: '#9E9E9E', texto: '#424242', fondo: '#EEEEEE' },
  bata: { nombre: 'Blanco', hex: '#FFFFFF', texto: '#333333', fondo: '#FFFFFF' },
}

// Nombre para mostrar (pedido de Alfredo, 2026-11-07): M/C → MANGA CORTA, M/L → MANGA LARGA,
// sin C/R, sin "FRISA" ni "1 IMP."/"2 IMP." ni las onzas (7 OZ, 14OZ), C/REFLEJANTE → CON REFLEJANTE y S/REFLEJANTE → LISA. Solo en pantalla y PDF:
// 2026-11-09: también C/REF, S/REF, A. MARINO → AZUL MARINO y T-M → TALLA M; todo en mayúsculas.
// el nombre guardado sigue igual al de Microsip (con él se ligan los Excel y las OC).
export function nombreFrisa(nombre) {
  let n = String(nombre ?? '')
  // Camisa de mezclilla: sin manga ni 1B/1I. La de nuevo ingreso solo dice "nuevo ingreso".
  if (/^\s*CAMISA\b/i.test(n)) {
    n = n.replace(/\bM\s*\/\s*L\b|\bMANGA\s+LARGA\b/gi, '').replace(/\b1[BI]\b/gi, '')
    if (/NUEVO\s+INGRESO/i.test(n)) n = n.replace(/\b[CS]\s*\/\s*REFLEJANTE\b|\bCON\s+REFLEJANTE\b/gi, '')
  }
  return n
    .replace(/\bC\s*\/\s*R\b\s*/gi, '')
    .replace(/\bM\s*\/\s*C\b/gi, 'MANGA CORTA')
    .replace(/\bM\s*\/\s*L\b/gi, 'MANGA LARGA')
    .replace(/\bC\s*\/\s*REFLEJANTE\b/gi, 'CON REFLEJANTE')
    .replace(/\bS\s*\/\s*REFLEJANTE\b/gi, 'LISA')
    .replace(/\bC\s*\/\s*REF\b\.?/gi, 'CON REFLEJANTE')
    .replace(/\bS\s*\/\s*REF\b\.?/gi, 'LISA')
    .replace(/\bA\.\s*MARINO\b/gi, 'AZUL MARINO')
    .replace(/\bAZUL\s+M\.(?=\s|$)/gi, 'AZUL MARINO')
    .replace(/\bT-([0-9A-Z]+)\b/gi, 'TALLA $1')
    .replace(/\b\d+\s*IMP\b\.?/gi, '')
    .replace(/\bFRISA\b/gi, '')
    .replace(/\b\d+\s*OZ\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// producto: { tipo, color, nombre, insumo? } → { clave, nombre, hex, reflejante } | null
// Misma regla que las etiquetas. insumo = playera lisa del taller (sin estampar):
// las marino lisas sirven para varios productos, así que no llevan color.
export function colorProductoFrisa(p) {
  if (!p) return null
  const nombre = sinAcentos(p.nombre)
  const t = `${sinAcentos(p.color)} ${nombre}`
  const reflejante = /\bC\s*\/\s*REF|\bCON\s+REFLEJANTE/.test(nombre)
  let clave = null
  if (sinAcentos(p.tipo) === 'PLAYERA' || nombre.startsWith('PLAYERA')) {
    if (/MANGO|AMARILL|\bORO\b/.test(t)) clave = 'mango'
    else if (/\bVERDE/.test(t)) clave = 'verde'
    else if (/\bROJ/.test(t)) clave = 'roja'
    else if (/MARINO|\bAZUL/.test(t) && p.insumo) {
      // Lisa marino del taller: sirve para Celeste, Azul rey o Marino; texto en marino, sin muestra.
      return { clave: 'marino_insumo', ...PALETA_FRISA.pml_lisa, nombre: 'Azul marino', reflejante: false, sinMuestra: true }
    } else if (/MARINO|\bAZUL/.test(t)) {
      const corta = /\bM\s*\/\s*C\b|MANGA\s+CORTA/.test(nombre)
      clave = reflejante ? (corta ? 'pmc_ref' : 'pml_ref') : corta ? null : 'pml_lisa'
    }
  } else if (nombre.startsWith('CAMISA')) clave = /NUEVO\s+INGRESO/.test(nombre) ? 'camisa_ni' : 'camisa'
  else if (nombre.startsWith('PANTALON')) clave = /LARGO\s*34/.test(nombre) ? 'pant34' : 'pant'
  else if (nombre.startsWith('BOLSA')) clave = 'bolsa'
  else if (nombre.startsWith('BATA')) clave = 'bata'
  if (!clave) return null
  // Las camisas de mezclilla llevan reflejante (así vienen en la etiqueta).
  const conRef = reflejante || clave === 'camisa' || clave === 'camisa_ni'
  return { clave, ...PALETA_FRISA[clave], reflejante: conRef }
}
