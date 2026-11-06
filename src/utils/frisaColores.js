// Color de cada playera de Frisa (pedido de Alfredo, 2026-11-06): el nombre
// va en el color de la playera, oscuro y en negritas, sobre el mismo color
// en claro. Solo playeras; lo demás se queda como está.

export const COLORES_PLAYERA = {
  roja: { nombre: 'Roja', texto: '#9b1c1c', fondo: '#fde4e1' },
  amarilla: { nombre: 'Amarilla', texto: '#7a5600', fondo: '#fff1bf' },
  verde: { nombre: 'Verde', texto: '#1d5c30', fondo: '#dcf2e2' },
  marino: { nombre: 'Azul marino', texto: '#1a2a52', fondo: '#dfe6f4' },
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
