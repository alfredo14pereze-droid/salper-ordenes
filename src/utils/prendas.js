// V64 — resumen corto de las prendas de una orden para el Dashboard:
// "Short", "Playera y Short", "Playera, Short y Chamarra". Nombres únicos
// (sin distinguir mayúsculas), en el orden en que se capturaron.
export function resumenPrendas(order) {
  const items = Array.isArray(order?.items) ? order.items : []
  const vistos = new Set()
  const nombres = []
  for (const item of items) {
    const nombre = typeof item?.garment === 'string' ? item.garment.trim() : ''
    if (!nombre || vistos.has(nombre.toLowerCase())) continue
    vistos.add(nombre.toLowerCase())
    nombres.push(nombre)
  }
  if (nombres.length <= 1) return nombres[0] || ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}
