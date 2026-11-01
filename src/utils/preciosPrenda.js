// Fase 1B — captura de precio por PRENDA: "Mismo precio" o "Precios por talla".
//
// Es solo pantalla: al guardar se sigue mandando un precio por línea
// (prenda + talla) a `orden_lineas`, igual que en V159 (ver preciosLineas.js).
//
// Estado de captura de una prenda:
//   { modo: 'mismo',  unico: '250', grupos: [...] }
//   { modo: 'tallas', unico: '',    grupos: [{ precio: '250', tallas: ['10', '12'] },
//                                            { precio: '280', tallas: ['CH'] }] }
// Las tallas se guardan por NOMBRE (no por posición) para que agregar o quitar
// tallas en el editor de prendas no mueva los precios a otra talla.

import { precioNumero, tallaSeGuarda } from './preciosLineas.js'

export function claveTalla(talla) {
  return String(talla ?? '').trim()
}

function textoPrecio(valor) {
  return valor === null || valor === undefined ? '' : String(valor).trim()
}

function mismoPrecio(a, b) {
  const na = precioNumero(a)
  const nb = precioNumero(b)
  return na === nb
}

// Tallas con cantidad de una prenda del formulario, en orden y sin repetir.
export function tallasDeItem(item) {
  const vistas = new Set()
  const tallas = []
  for (const s of item?.sizes || []) {
    if (!tallaSeGuarda(s)) continue
    const t = claveTalla(s.talla)
    if (vistas.has(t)) continue
    vistas.add(t)
    tallas.push(t)
  }
  return tallas
}

// Estado inicial a partir de los precios que ya tiene cada talla.
// [{ talla, precio }] → si todas valen lo mismo (o ninguna tiene precio):
// "Mismo precio"; si no, un grupo por precio (las tallas sin precio quedan
// sin grupo, para que se vea qué falta).
export function estadoDesdePrecios(tallas) {
  const lista = (tallas || []).map((t) => ({ talla: claveTalla(t.talla), precio: textoPrecio(t.precio) }))
  const primero = lista[0]?.precio ?? ''
  if (lista.every((t) => mismoPrecio(t.precio, primero))) {
    return { modo: 'mismo', unico: precioNumero(primero) == null ? '' : primero, grupos: [{ precio: '', tallas: [] }] }
  }
  const grupos = []
  for (const t of lista) {
    if (precioNumero(t.precio) == null) continue
    const g = grupos.find((x) => mismoPrecio(x.precio, t.precio))
    if (g) g.tallas.push(t.talla)
    else grupos.push({ precio: t.precio, tallas: [t.talla] })
  }
  return { modo: 'tallas', unico: '', grupos: grupos.length ? grupos : [{ precio: '', tallas: [] }] }
}

// Estado de captura de una prenda del alta. Los borradores de antes (V159)
// traen el precio en cada talla y no traen `precios`: se arma de ahí.
export function estadoDeItem(item) {
  if (item?.precios?.modo) return item.precios
  return estadoDesdePrecios(
    (item?.sizes || []).filter(tallaSeGuarda).map((s) => ({ talla: s.talla, precio: s.precio_unitario }))
  )
}

// Precio (texto) que le toca a una talla según el estado.
export function precioDeTalla(estado, talla) {
  if (!estado) return ''
  if (estado.modo === 'mismo') return textoPrecio(estado.unico)
  const t = claveTalla(talla)
  const g = (estado.grupos || []).find((x) => x.tallas.includes(t))
  return g ? textoPrecio(g.precio) : ''
}

// La prenda del alta con el precio de cada talla puesto (`precio_unitario`),
// listo para filasDeFormulario / lineasParaGuardar. La marca de mostrador por
// talla (borradores de V159) ya no se usa en el alta: ahora es de la orden.
export function aplicarPrecios(item) {
  const estado = estadoDeItem(item)
  return {
    ...item,
    sizes: (item?.sizes || []).map((s) => {
      const { venta_mostrador: _vm, ...talla } = s
      return tallaSeGuarda(s) ? { ...talla, precio_unitario: precioDeTalla(estado, s.talla) } : talla
    }),
  }
}

// Quita del objeto de la prenda lo que es solo de captura (no va a orders.items).
export function sinDatosDePrecio(item) {
  const { precios: _precios, ...resto } = item || {}
  return resto
}

// ---------- cambios (todos regresan un estado nuevo) ----------

// Al pasar a "Precios por talla", el precio único queda como primer grupo con
// todas las tallas (luego se separan las que cambian). Al regresar a "Mismo
// precio" se queda el precio del primer grupo.
export function cambiarModo(estado, modo, tallas) {
  if (estado.modo === modo) return estado
  if (modo === 'tallas') {
    return { ...estado, modo, grupos: [{ precio: textoPrecio(estado.unico), tallas: [...(tallas || [])] }] }
  }
  const primero = (estado.grupos || []).find((g) => precioNumero(g.precio) != null)
  return { ...estado, modo, unico: primero ? textoPrecio(primero.precio) : textoPrecio(estado.unico) }
}

export function cambiarPrecioUnico(estado, precio) {
  return { ...estado, unico: precio }
}

export function cambiarPrecioGrupo(estado, indice, precio) {
  return { ...estado, grupos: estado.grupos.map((g, i) => (i === indice ? { ...g, precio } : g)) }
}

// Marca o desmarca una talla en un grupo. Una talla vive en un solo grupo.
export function alternarTalla(estado, indice, talla) {
  const t = claveTalla(talla)
  return {
    ...estado,
    grupos: estado.grupos.map((g, i) => {
      if (i === indice) return g.tallas.includes(t) ? { ...g, tallas: g.tallas.filter((x) => x !== t) } : { ...g, tallas: [...g.tallas, t] }
      return g.tallas.includes(t) ? { ...g, tallas: g.tallas.filter((x) => x !== t) } : g
    }),
  }
}

export function agregarGrupo(estado) {
  return { ...estado, grupos: [...estado.grupos, { precio: '', tallas: [] }] }
}

export function quitarGrupo(estado, indice) {
  const grupos = estado.grupos.filter((_, i) => i !== indice)
  return { ...estado, grupos: grupos.length ? grupos : [{ precio: '', tallas: [] }] }
}

// ---------- consultas para la pantalla ----------

// Grupo en el que está una talla (o -1).
export function grupoDeTalla(estado, talla) {
  const t = claveTalla(talla)
  return (estado?.grupos || []).findIndex((g) => g.tallas.includes(t))
}

// Tallas (de las que tienen cantidad) que todavía no tienen precio.
export function tallasSinPrecio(estado, tallas) {
  return (tallas || []).filter((t) => !(precioNumero(precioDeTalla(estado, t)) > 0))
}
