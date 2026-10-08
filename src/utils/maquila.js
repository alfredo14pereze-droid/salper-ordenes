import { PROCESOS_MAQUILA_OPTIONS, TIPO_MAQUILA } from '../lib/constants.js'

// V143 — órdenes de "Maquila": trabajo para un cliente externo. Cada orden es
// UN producto del catálogo de ese cliente, identificada por el número de
// corte del cliente, y sus etapas son los procesos de ese producto (más
// bordado si la orden lo lleva). Ver schema_v143_maquila.sql.
export const esOrdenMaquila = (orderTypeKey) => orderTypeKey === TIPO_MAQUILA

export const esClienteMaquila = (cliente) => !!cliente?.tipo_orden?.includes(TIPO_MAQUILA)

const ORDEN = PROCESOS_MAQUILA_OPTIONS.map((o) => o.key)

// Sin repetidos, solo procesos válidos y siempre en el orden del flujo.
export function ordenarProcesos(procesos) {
  const set = new Set(procesos || [])
  return ORDEN.filter((k) => set.has(k))
}

// Procesos que tendrá la orden: los del producto, más bordado si se marcó.
export function procesosDeLaOrden(producto, llevaBordado) {
  return ordenarProcesos([...(producto?.procesos || []), ...(llevaBordado ? ['bordado'] : [])])
}

export function etiquetaProcesos(procesos) {
  return ordenarProcesos(procesos)
    .map((k) => PROCESOS_MAQUILA_OPTIONS.find((o) => o.key === k).label)
    .join(' → ')
}

export const productoBorda = (producto) => !!producto?.procesos?.includes('bordado')

export function nuevaPrendaMaquila() {
  return { id: crypto.randomUUID(), garment: '', producto_id: '', lleva_bordado: false, sizes: [{ talla: '', cantidad: '' }] }
}

// La prenda de una orden de maquila: el nombre del producto, sus tallas y si
// lleva bordado (obligado cuando el producto ya borda).
export function prendaMaquila(item, producto, llevaBordado) {
  return {
    id: item?.id || crypto.randomUUID(),
    garment: producto?.nombre || item?.garment || '',
    producto_id: producto?.id || item?.producto_id || '',
    lleva_bordado: !!llevaBordado || productoBorda(producto),
    sizes: (item?.sizes || [])
      .filter((s) => String(s.talla ?? '').trim() && Number(s.cantidad) > 0)
      .map((s) => ({ talla: String(s.talla).trim(), cantidad: Number(s.cantidad) })),
  }
}

// Mensaje de error (o null) antes de guardar una orden de maquila.
export function validarOrdenMaquila({ cliente, producto, numeroCorte, item, llevaBordado }) {
  if (!cliente) return 'Elige un cliente de maquila.'
  if (!producto) return 'Elige el producto del catálogo de este cliente.'
  if (!String(numeroCorte ?? '').trim()) return 'Falta el número de corte.'
  if (prendaMaquila(item, producto, llevaBordado).sizes.length === 0) return 'Captura al menos una talla con su cantidad.'
  if (procesosDeLaOrden(producto, llevaBordado).length === 0) {
    return `El producto "${producto.nombre}" no tiene procesos marcados. Márcalos en el catálogo del cliente antes de crear la orden.`
  }
  return null
}

// Fotos del producto que se llevan a la orden: `fotos` ([{url, path}], V133) o,
// en productos viejos, solo la principal. Sin `path` no se puede copiar.
export function fotosDeProducto(producto) {
  const fotos = Array.isArray(producto?.fotos) && producto.fotos.length > 0 ? producto.fotos : producto?.foto_path ? [{ url: producto.foto_url, path: producto.foto_path }] : []
  return fotos.filter((f) => f?.path).map((f) => ({ url: f.url, path: f.path, name: producto.nombre }))
}
