// V57 — utilidades del módulo Pedidos Colegio (beta, solo admin_general).

// Formato del recibo: "4,800.00" (sin signo de pesos), igual que el PDF
// de ejemplo (SALPER DEPORTES.pdf).
export function formatImporte(value) {
  return Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatMonto(value) {
  const n = Number(value || 0)
  return `${n < 0 ? '-' : ''}$${formatImporte(Math.abs(n))}`
}

// Redondeo a centavos, para que subtotal/anticipo/saldo no arrastren
// errores de coma flotante (el servidor recalcula todo igual — esto solo
// es para lo que se muestra en pantalla antes de guardar).
export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function sumAbonos(abonos) {
  return round2((abonos || []).reduce((sum, a) => sum + Number(a.monto || 0), 0))
}

// Saldo pendiente de un pedido = subtotal - anticipo - suma de abonos.
export function calcSaldo(pedido, abonos) {
  return round2(Number(pedido.subtotal || 0) - Number(pedido.anticipo_monto || 0) - sumAbonos(abonos))
}

// ---- Importe con letra ("(Cuatro mil ochocientos pesos 00/100 m.n.)") --
// Como en el recibo de ejemplo. Soporta hasta 999,999,999.
const UNIDADES = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece',
  'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós',
  'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
]
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos',
  'ochocientos', 'novecientos',
]

function menorDeMil(n) {
  if (n === 100) return 'cien'
  const c = Math.floor(n / 100)
  const r = n % 100
  const partes = []
  if (c) partes.push(CENTENAS[c])
  if (r) {
    if (r < 30) {
      partes.push(UNIDADES[r])
    } else {
      const d = Math.floor(r / 10)
      const u = r % 10
      partes.push(u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d])
    }
  }
  return partes.join(' ')
}

// "uno" -> "un" y "veintiuno" -> "veintiún" cuando van antes de "mil" o
// "millones" (ej. "treinta y un mil", "veintiún millones").
function apocope(texto) {
  return texto.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')
}

function enLetras(n) {
  if (n === 0) return 'cero'
  const millones = Math.floor(n / 1e6)
  const miles = Math.floor((n % 1e6) / 1000)
  const resto = n % 1000
  const partes = []
  if (millones) partes.push(millones === 1 ? 'un millón' : `${apocope(menorDeMil(millones))} millones`)
  if (miles) partes.push(miles === 1 ? 'mil' : `${apocope(menorDeMil(miles))} mil`)
  if (resto) partes.push(menorDeMil(resto))
  return partes.join(' ')
}

export function montoConLetra(monto) {
  const cents = Math.round((Number(monto) || 0) * 100)
  const enteros = Math.floor(cents / 100)
  const centavos = cents % 100
  // Apócope también antes de "pesos": "un peso", "veintiún pesos",
  // "ciento un pesos" (uso normal en importes con letra).
  const palabras = apocope(enLetras(enteros))
  const capitalizado = palabras.charAt(0).toUpperCase() + palabras.slice(1)
  const de = enteros >= 1e6 && enteros % 1e6 === 0 ? ' de' : ''
  const moneda = enteros === 1 ? 'peso' : 'pesos'
  return `(${capitalizado}${de} ${moneda} ${String(centavos).padStart(2, '0')}/100 m.n.)`
}
