import { CLIENTE_TIPO_ORDEN_OPTIONS } from '../lib/constants'

// V60 — valor especial del selector de cliente de "Nueva orden": "Otro
// cliente (no registrado)". No es un id real — significa que se va a
// capturar nombre/teléfono/correo a mano SOLO para esa orden.
export const CLIENTE_OTRO = '__otro__'

const FIXED_TIPO_KEYS = CLIENTE_TIPO_ORDEN_OPTIONS.map((o) => o.key)

// Clientes que se ofrecen para un tipo de orden. Un cliente puede ser de
// varios tipos (`tipo_orden` es un arreglo). Los clientes SIN ninguna
// categoría todavía (`tipo_orden` vacío) se siguen mostrando en todos los
// tipos — para no esconder de golpe a clientes reales que aún no se han
// clasificado en Catálogos. Si el tipo de orden es uno personalizado
// (agregado con "+ Nuevo tipo") o no hay tipo elegido, se muestran todos.
export function filtrarClientesPorTipo(clientes, orderTypeKey) {
  if (!orderTypeKey || !FIXED_TIPO_KEYS.includes(orderTypeKey)) return clientes
  return clientes.filter((c) => !c.tipo_orden?.length || c.tipo_orden.includes(orderTypeKey))
}
