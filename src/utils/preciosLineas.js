// V159 — Precio por línea y "Venta de mostrador" (lógica sin UI).
//
// Una LÍNEA es una talla con cantidad de una prenda de `orders.items`:
// prenda + talla + cantidad viven en orders.items (lo lee producción);
// precio_unitario y venta_mostrador viven en la tabla `orden_lineas`
// (solo roles de dinero), ligados por (item_index, size_index).
//
// En el formulario de alta, el precio y la bandera se guardan dentro de cada
// talla del estado (`sizes[j].precio_unitario` / `sizes[j].venta_mostrador`)
// para que no se desalineen al agregar o quitar tallas. Antes de mandar
// `items` a la base se quitan (ver lineasParaGuardar + el limpiado de tallas
// del alta, que solo conserva talla y cantidad).
//
// Mismas reglas que el servidor (schema_v159_lineas_mostrador.sql):
//  * Una línea que no es de mostrador necesita precio unitario > 0.
//  * Las líneas de mostrador no piden precio y no suman al total.
//  * Frisa y Venta Mostrador (tipo de orden) no llevan precio.

const TIPOS_SIN_PRECIO = ['frisa', 'venta_mostrador']

export function tipoLlevaPrecio(tipo) {
  return !TIPOS_SIN_PRECIO.includes(String(tipo || ''))
}

// Misma regla que el alta (NewOrderPage) y prendaMaquila: la talla se guarda
// si tiene nombre y cantidad > 0. Tiene que coincidir para que los índices
// de las líneas apunten a la talla correcta.
export function tallaSeGuarda(size) {
  return String(size?.talla ?? '').trim() !== '' && Number(size?.cantidad) > 0
}

export function precioNumero(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

function redondear(n) {
  return Math.round(n * 100) / 100
}

// Filas para la tabla de precios del alta. `itemIndex`/`sizeIndex` son los del
// ESTADO del formulario (para poder editar), no los que se guardan.
export function filasDeFormulario(items) {
  const filas = []
  ;(items || []).forEach((item, itemIndex) => {
    ;(item?.sizes || []).forEach((size, sizeIndex) => {
      if (!tallaSeGuarda(size)) return
      const mostrador = !!size.venta_mostrador
      const precio = mostrador ? null : precioNumero(size.precio_unitario)
      const cantidad = Number(size.cantidad)
      filas.push({
        itemIndex,
        sizeIndex,
        prenda: String(item.garment || '').trim() || `Prenda ${itemIndex + 1}`,
        talla: String(size.talla).trim(),
        cantidad,
        precioUnitario: precio,
        ventaMostrador: mostrador,
        subtotal: !mostrador && precio > 0 ? redondear(cantidad * precio) : 0,
      })
    })
  })
  return filas
}

// Filas del detalle a partir de `orden_totales().renglones` (ya trae el precio
// efectivo: el de la línea o, en órdenes viejas, el de la prenda de V77).
export function filasDeRenglones(renglones) {
  return (renglones || []).map((r) => ({
    itemIndex: r.item_index,
    sizeIndex: r.size_index,
    prenda: r.prenda || `Prenda ${Number(r.item_index) + 1}`,
    talla: r.talla || '',
    cantidad: Number(r.cantidad) || 0,
    precioUnitario: r.venta_mostrador ? null : precioNumero(r.precio_unitario),
    ventaMostrador: !!r.venta_mostrador,
    extrasPorPieza: Number(r.extras_por_pieza) || 0,
    subtotal: Number(r.subtotal_renglon) || 0,
  }))
}

// Subtotal de una fila editada en pantalla (precio + extras de V77 por pieza).
export function subtotalFila(fila) {
  if (fila.ventaMostrador) return 0
  const precio = precioNumero(fila.precioUnitario)
  if (!(precio > 0)) return 0
  return redondear(fila.cantidad * (precio + (Number(fila.extrasPorPieza) || 0)))
}

export function filasSinPrecio(filas) {
  return (filas || []).filter((f) => !f.ventaMostrador && !(precioNumero(f.precioUnitario) > 0))
}

// Total = suma de las líneas que no son de mostrador. Saldo = total − anticipo.
export function resumenPago(filas, anticipo = 0) {
  const total = redondear((filas || []).reduce((s, f) => s + subtotalFila(f), 0))
  const anticipoNum = Number(anticipo) > 0 ? Number(anticipo) : 0
  return {
    total,
    anticipo: anticipoNum,
    saldo: redondear(total - anticipoNum),
    hayCobro: (filas || []).some((f) => !f.ventaMostrador),
    sinPrecio: filasSinPrecio(filas),
  }
}

// Mensaje (o null) para no dejar guardar una orden con líneas sin precio.
export function mensajeFaltanPrecios(filas, tipo) {
  if (!tipoLlevaPrecio(tipo)) return null
  const sin = filasSinPrecio(filas)
  if (sin.length === 0) return null
  return `Falta precio unitario en: ${sin.map((f) => `${f.prenda} ${f.talla}`).join(', ')}. Captúralo o márcala como venta de mostrador.`
}

// Líneas para create_order_con_lineas: `items` son las prendas YA filtradas
// (en el mismo orden en que se mandan a la base); los índices de talla se
// cuentan solo entre las tallas que se guardan.
export function lineasParaGuardar(items) {
  const lineas = []
  ;(items || []).forEach((item, itemIndex) => {
    ;(item?.sizes || []).filter(tallaSeGuarda).forEach((size, sizeIndex) => {
      const mostrador = !!size.venta_mostrador
      lineas.push({
        item_index: itemIndex,
        size_index: sizeIndex,
        precio_unitario: mostrador ? null : precioNumero(size.precio_unitario),
        venta_mostrador: mostrador,
      })
    })
  })
  return lineas
}

// Líneas para set_orden_lineas desde las filas del detalle.
export function lineasDeFilas(filas) {
  return (filas || []).map((f) => ({
    item_index: f.itemIndex,
    size_index: f.sizeIndex,
    precio_unitario: f.ventaMostrador ? null : precioNumero(f.precioUnitario),
    venta_mostrador: !!f.ventaMostrador,
  }))
}

// Precio "de mostrador" en una talla del formulario: cambia la bandera y, si
// se marca, borra el precio (no se pide).
export function marcarMostrador(size, valor) {
  return valor ? { ...size, venta_mostrador: true, precio_unitario: '' } : { ...size, venta_mostrador: false }
}

// Conjunto "itemIndex:sizeIndex" de líneas de mostrador (para las etiquetas).
export function clavesMostrador(filas) {
  return new Set((filas || []).map((f) => `${f.item_index ?? f.itemIndex}:${f.size_index ?? f.sizeIndex}`))
}

// ¿La talla (item, size) de una orden ya guardada es de mostrador?
export function esLineaMostrador(claves, itemIndex, sizeIndex) {
  return !!claves && claves.has(`${itemIndex}:${sizeIndex}`)
}
