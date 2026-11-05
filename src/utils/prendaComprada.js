// V183 — Playeras compradas: cada playera de una orden es "Fabricada" (por
// defecto, sin la clave) o "Comprada" (items[].comprada = true). Una prenda
// comprada no lleva tela y no le aparece a corte. Si TODAS las prendas de la
// orden son compradas, la base le quita la etapa de corte (ver
// schema_v183_playera_comprada.sql).

// ¿A esta prenda se le ofrece el botón Fabricada / Comprada? Por ahora, solo playeras.
export function puedeSerComprada(garment) {
  return /playera/i.test(String(garment || ''))
}

export function esComprada(item) {
  return !!item && item.comprada === true
}

// Cambios para la prenda al escoger Fabricada / Comprada. Comprada quita la tela.
export function marcarComprada(comprada) {
  return comprada ? { comprada: true, tela_id: '', tela_nombre: '' } : { comprada: false }
}

// Al cambiar el nombre de la prenda: si ya no es playera, deja de ser comprada.
export function cambioDePrenda(item, garment) {
  return esComprada(item) && !puedeSerComprada(garment) ? { garment, comprada: false } : { garment }
}

const conContenido = (item) =>
  !!item && typeof item === 'object' && (String(item.garment ?? '').trim() !== '' || (item.sizes || []).some((s) => String(s?.talla ?? '').trim()))

// Lo que ve corte: las prendas que no son compradas, con su posición original
// (el índice importa para surtido, cambios, etc.).
export function prendasParaCorte(items = []) {
  return (items || []).map((item, index) => ({ item, index })).filter(({ item }) => !esComprada(item))
}

// ¿Todas las prendas con contenido son compradas? (misma regla que orden_todo_comprado)
export function todoComprado(items = []) {
  const llenas = (items || []).filter(conContenido)
  return llenas.length > 0 && llenas.every(esComprada)
}
