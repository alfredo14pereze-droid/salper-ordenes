// 2026-11-26 — Las batas de ATR guardan en la orden su producto del catálogo
// ("Bata sin bolsa Azul Cielo"), pero la orden solo enseñaba "Bata". Esto saca
// "Con bolsa" / "Sin bolsa" del nombre del producto para mostrarlo.
export function bolsaDePrenda(item) {
  const m = /\b(con|sin)\s+bolsa\b/i.exec(String(item?.producto_nombre || ''))
  if (!m) return ''
  return m[1].toLowerCase() === 'con' ? 'Con bolsa' : 'Sin bolsa'
}

// "Bata · Azul Cielo · Sin bolsa" (lo que haya de los tres).
export function nombrePrendaCompleto(item, fallback = '—') {
  return [String(item?.garment || '').trim() || fallback, String(item?.color || '').trim(), bolsaDePrenda(item)]
    .filter(Boolean)
    .join(' · ')
}
