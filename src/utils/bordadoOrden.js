// V132 — órdenes de tipo "bordado": son mucho más simples que las demás. Solo
// llevan prenda + tallas/cantidades + sus bordados (cada uno con foto, y con
// "dónde va" si la prenda no es cachucha). Las prendas ya vienen listas; solo
// hay que bordarlas y terminarlas (etapas bordado y terminado).
export const ORDER_TYPE_BORDADO = 'bordado'

export const PRENDAS_BORDADO = ['Camisa', 'Polo', 'Playera', 'Pantalón', 'Chamarra', 'Sudadera', 'Chaleco', 'Mandil', 'Cachucha']
export const OTRA_PRENDA = '__otra__'

export const esOrdenBordado = (orderTypeKey) => orderTypeKey === ORDER_TYPE_BORDADO

// V220 — órdenes de tipo "impresión": igual que bordado (prenda + tallas +
// sus impresiones con foto y dónde va), pero pasan por impresión
// ('impresion_prenda', la hace terminado) y terminado. Sin bordado.
export const ORDER_TYPE_IMPRESION = 'impresion'
export const esOrdenImpresion = (orderTypeKey) => orderTypeKey === ORDER_TYPE_IMPRESION
// "Orden simple": las que usan el editor corto (bordado o impresión).
export const esOrdenSimple = (orderTypeKey) => esOrdenBordado(orderTypeKey) || esOrdenImpresion(orderTypeKey)

// Qué campo y qué bandera usa cada tipo de orden simple.
export const PROCESO_SIMPLE = {
  bordado: { campo: 'bordados', bandera: 'lleva_bordado', nombre: 'bordado', plural: 'bordados' },
  impresion: { campo: 'impresiones', bandera: 'lleva_impresion', nombre: 'impresión', plural: 'impresiones' },
}
export const procesoDeOrden = (orderTypeKey) => (esOrdenImpresion(orderTypeKey) ? 'impresion' : 'bordado')

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

export function nuevaPrendaBordado(proceso = 'bordado') {
  const { campo, bandera } = PROCESO_SIMPLE[proceso]
  return {
    id: crypto.randomUUID(),
    garment: '',
    [bandera]: true,
    [campo]: [],
    sizes: [{ talla: '', cantidad: '' }],
  }
}

// En órdenes de bordado toda prenda lleva bordado (así se crea la etapa
// 'bordado' en el servidor) y se descartan las fotos/ubicaciones vacías.
// V220 — `proceso` = 'bordado' | 'impresion' (en impresión, lleva_impresion
// crea la etapa 'impresion_prenda' en el servidor).
export function normalizarItemsBordado(items, proceso = 'bordado') {
  const { campo, bandera } = PROCESO_SIMPLE[proceso]
  return items.map((item) => ({
    ...item,
    [bandera]: true,
    [campo]: (item[campo] || [])
      .filter((b) => b.foto_url || String(b.ubicacion || '').trim())
      .map((b) => ({ ...b, ubicacion: esCachucha(item.garment) ? '' : String(b.ubicacion || '').trim() })),
  }))
}

// Mensaje de error (o null) antes de guardar una orden de bordado.
export function validarItemsBordado(items, proceso = 'bordado') {
  const { campo, nombre: proc, plural } = PROCESO_SIMPLE[proceso]
  const art = proceso === 'impresion' ? 'la' : 'el'
  const una = proceso === 'impresion' ? 'una' : 'un'
  const llenas = items.filter((i) => String(i.garment || '').trim() || i.sizes?.some((s) => String(s.talla).trim()))
  if (llenas.length === 0) return 'Agrega al menos una prenda.'
  for (const [n, item] of llenas.entries()) {
    const nombre = item.garment || `Prenda ${n + 1}`
    const lista = (item[campo] || []).filter((b) => b.foto_url || String(b.ubicacion || '').trim())
    if (lista.length === 0) return `${nombre}: agrega la foto de${art === 'el' ? 'l' : ' la'} ${proc}.`
    for (const b of lista) {
      if (!b.foto_url) return `${nombre}: falta la foto de ${una} ${proc}.`
      if (!esCachucha(item.garment) && !String(b.ubicacion || '').trim()) return `${nombre}: falta indicar dónde va ${proceso === 'impresion' ? 'una de las' : 'uno de los'} ${plural}.`
    }
  }
  return null
}
