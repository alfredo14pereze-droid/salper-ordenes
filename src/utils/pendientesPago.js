// V129 — helpers de un pendiente: lista de prendas y estado de pago. Todo cae
// en las columnas de siempre (prenda/talla/cantidad/pagado) cuando el pendiente
// es anterior a V129 y no trae `prendas` ni `pago_estado`.
export function prendasDe(p) {
  if (Array.isArray(p?.prendas) && p.prendas.length > 0) return p.prendas
  if (p?.prenda || p?.talla) return [{ prenda: p.prenda || '', talla: p.talla || '', cantidad: p.cantidad || 1 }]
  return []
}

// "Playera M ×2 · Short L ×1"
export function resumenPrendas(p) {
  return prendasDe(p)
    .map((x) => `${x.prenda} talla ${x.talla}${Number(x.cantidad) > 1 ? ` ×${x.cantidad}` : ''}`)
    .join(' · ')
}

export function estadoPago(p) {
  if (!p?.es_para_cliente) return null
  if (p.pago_estado) return p.pago_estado
  return p.pagado ? 'pagado' : 'no_pagado'
}

const dinero = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
export const formatoDinero = dinero

export function restaPago(p) {
  return Math.max(0, (Number(p?.pago_total) || 0) - (Number(p?.pago_anticipo) || 0))
}

// Texto corto para tarjetas y detalle.
export function textoPago(p) {
  const e = estadoPago(p)
  if (e === 'pagado') return '💰 Pagado'
  if (e === 'anticipo') return `Anticipo ${dinero(p.pago_anticipo)} · Resta ${dinero(restaPago(p))}`
  return 'No pagado'
}
