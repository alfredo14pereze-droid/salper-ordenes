// V132 — órdenes de tipo "bordado": son mucho más simples que las demás. Solo
// llevan prenda + tallas/cantidades + sus bordados (cada uno con foto, y con
// "dónde va" si la prenda no es cachucha). Las prendas ya vienen listas; solo
// hay que bordarlas y terminarlas (etapas bordado y terminado).
export const ORDER_TYPE_BORDADO = 'bordado'

export const PRENDAS_BORDADO = ['Camisa', 'Polo', 'Playera', 'Pantalón', 'Chamarra', 'Sudadera', 'Chaleco', 'Mandil', 'Cachucha']
export const OTRA_PRENDA = '__otra__'

export const esOrdenBordado = (orderTypeKey) => orderTypeKey === ORDER_TYPE_BORDADO

// Una cachucha solo pide la foto del bordado (no "dónde va").
export function esCachucha(garment) {
  const g = String(garment || '').trim().toLowerCase()
  return g.startsWith('cachucha') || g.startsWith('gorra')
}

// Cada bordado: { id, ubicacion, foto_url, foto_path }. `bordados` vive dentro de
// la prenda (JSONB de orders.items), así que lo puede capturar tienda al crear la
// orden sin depender de los permisos de orden_bordados.
export function nuevoBordado(extra = {}) {
  return { id: crypto.randomUUID(), ubicacion: '', foto_url: '', foto_path: '', ...extra }
}

export function nuevaPrendaBordado() {
  return {
    id: crypto.randomUUID(),
    garment: '',
    lleva_bordado: true,
    bordados: [],
    sizes: [{ talla: '', cantidad: '' }],
  }
}

// En órdenes de bordado toda prenda lleva bordado (así se crea la etapa
// 'bordado' en el servidor) y se descartan las fotos/ubicaciones vacías.
export function normalizarItemsBordado(items) {
  return items.map((item) => ({
    ...item,
    lleva_bordado: true,
    bordados: (item.bordados || [])
      .filter((b) => b.foto_url || String(b.ubicacion || '').trim())
      .map((b) => ({ ...b, ubicacion: esCachucha(item.garment) ? '' : String(b.ubicacion || '').trim() })),
  }))
}

// Mensaje de error (o null) antes de guardar una orden de bordado.
export function validarItemsBordado(items) {
  const llenas = items.filter((i) => String(i.garment || '').trim() || i.sizes?.some((s) => String(s.talla).trim()))
  if (llenas.length === 0) return 'Agrega al menos una prenda.'
  for (const [n, item] of llenas.entries()) {
    const nombre = item.garment || `Prenda ${n + 1}`
    const borda = (item.bordados || []).filter((b) => b.foto_url || String(b.ubicacion || '').trim())
    if (borda.length === 0) return `${nombre}: agrega la foto del bordado.`
    for (const b of borda) {
      if (!b.foto_url) return `${nombre}: falta la foto de un bordado.`
      if (!esCachucha(item.garment) && !String(b.ubicacion || '').trim()) return `${nombre}: falta indicar dónde va uno de los bordados.`
    }
  }
  return null
}
