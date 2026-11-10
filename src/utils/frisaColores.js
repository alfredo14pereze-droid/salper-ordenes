// Color de cada playera de Frisa (pedido de Alfredo, 2026-11-06): el nombre
// va en el color de la playera, oscuro y en negritas, sobre el mismo color
// en claro. Solo playeras; lo demás se queda como está.

export const COLORES_PLAYERA = {
  roja: { nombre: 'Roja', texto: '#9b1c1c', fondo: '#fde4e1' },
  amarilla: { nombre: 'Amarilla', texto: '#7a5600', fondo: '#fff1bf' },
  verde: { nombre: 'Verde', texto: '#1d5c30', fondo: '#dcf2e2' },
  marino: { nombre: 'Azul marino', texto: '#1a2a52', fondo: '#dfe6f4' },
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

// producto: { tipo, color, nombre } → 'roja' | 'amarilla' | 'verde' | 'marino' | null
export function colorPlayera(p) {
  if (!p) return null
  const nombre = sinAcentos(p.nombre)
  const esPlayera = sinAcentos(p.tipo) === 'PLAYERA' || nombre.startsWith('PLAYERA')
  if (!esPlayera) return null
  const t = `${sinAcentos(p.color)} ${nombre}`
  if (/\bROJ/.test(t)) return 'roja'
  if (/\bVERDE/.test(t)) return 'verde'
  if (/MANGO|AMARILL|\bORO\b/.test(t)) return 'amarilla'
  if (/MARINO|\bAZUL/.test(t)) return 'marino'
  return null
}
