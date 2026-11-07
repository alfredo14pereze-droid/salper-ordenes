// Reportes de Frisa: cada reporte = { titulo, nota, columnas: [{titulo, num?}], filas: [[...]], colores?: [prodOrNull] }.
// Sirve igual para CSV y para el PDF (components/pdf/FrisaReportePdf.jsx).
import { ESTADOS } from './frisaNiveles.js'
import { nombreLisa } from './frisaLisas.js'

const fecha = (d) => (d ? String(d).slice(0, 10) : '')
const fechaHora = (d) => (d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '')
const TIPO_MOV = { inicial: 'Inicial', ajuste: 'Ajuste (conteo)', entrega: 'Entrega a Frisa', ingreso_bodega: 'Ingreso a bodega', compra: 'Compra', consumo: 'Salida al taller (orden de taller)', devolucion: 'Regreso del taller' }
const ESTADO_SURT = { pendiente: 'Pendiente', surtida: 'Surtida', entregada: 'Entregada', cancelada: 'Cancelada' }

// filasNiveles: conNiveles(conInventario(...)) → filas con real/apartado/disponible/niveles
export function reporteInventario(filasNiveles) {
  const ordenadas = [...filasNiveles].sort((a, b) => String(a.clave).localeCompare(String(b.clave)))
  return {
    titulo: 'Inventario de la fábrica',
    nota: 'Real = en bodega · Apartado = surtido sin entregar · Disponible = real - apartado. Niveles con el disponible.',
    columnas: [{ titulo: 'Clave' }, { titulo: 'Nombre' }, { titulo: 'Real', num: true }, { titulo: 'Apartado', num: true }, { titulo: 'Disponible', num: true },
      { titulo: 'Mínimo', num: true }, { titulo: 'Reorden', num: true }, { titulo: 'Máximo', num: true }, { titulo: 'Estado' }, { titulo: 'A PEDIR', num: true }],
    filas: ordenadas.map((f) => [f.clave, f.nombre, f.real ?? f.stock_actual, f.apartado ?? 0, f.disponible ?? f.stock_actual,
      f.niveles.minimo, f.niveles.reorden, f.niveles.maximo, ESTADOS[f.niveles.estado].label, f.niveles.aPedir ?? '']),
    colores: ordenadas,
    totales: { Claves: ordenadas.length, 'Piezas reales': ordenadas.reduce((t, f) => t + (f.real ?? 0), 0), 'Piezas disponibles': ordenadas.reduce((t, f) => t + (f.disponible ?? 0), 0) },
  }
}

export function reporteMovimientos(movs, lisaMovs, { productos = [], lisas = [], desde, hasta }) {
  const prod = new Map(productos.map((p) => [p.id, p]))
  const lisa = new Map(lisas.map((l) => [l.id, l]))
  const todas = [
    ...movs.map((m) => ({ en: m.creado_en, que: m.clave, nombre: prod.get(m.producto_id)?.nombre || '', tipo: TIPO_MOV[m.tipo] || m.tipo, cantidad: m.cantidad, ref: m.referencia || '', notas: m.notas || '', quien: m.creado_por_nombre || '', color: prod.get(m.producto_id) })),
    ...lisaMovs.map((m) => {
      const l = lisa.get(m.lisa_id)
      return { en: m.creado_en, que: 'Playera lisa', nombre: l ? nombreLisa(l) : '', tipo: TIPO_MOV[m.tipo] || m.tipo, cantidad: m.cantidad, ref: m.referencia || '', notas: m.notas || '', quien: m.creado_por_nombre || '', color: null }
    }),
  ].sort((a, b) => String(a.en).localeCompare(String(b.en)))
  return {
    titulo: 'Movimientos del inventario',
    nota: `Del ${desde || 'inicio'} al ${hasta || 'hoy'}. Incluye playera lisa.`,
    columnas: [{ titulo: 'Fecha' }, { titulo: 'Clave' }, { titulo: 'Nombre' }, { titulo: 'Movimiento' }, { titulo: 'Cantidad', num: true }, { titulo: 'Referencia' }, { titulo: 'Notas' }, { titulo: 'Quién' }],
    filas: todas.map((m) => [fechaHora(m.en), m.que, m.nombre, m.tipo, m.cantidad, m.ref, m.notas, m.quien]),
    colores: todas.map((m) => m.color || null),
    totales: { Movimientos: todas.length, Entradas: todas.filter((m) => m.cantidad > 0).reduce((t, m) => t + m.cantidad, 0), Salidas: -todas.filter((m) => m.cantidad < 0).reduce((t, m) => t + m.cantidad, 0) },
  }
}

export function reporteSurtidos(surtidos, lineas, { productos = [], desde, hasta, estado }) {
  const prod = new Map(productos.map((p) => [p.id, p]))
  const enRango = (s) => (!desde || fecha(s.creado_en) >= desde) && (!hasta || fecha(s.creado_en) <= hasta) && (!estado || estado === 'todos' || s.estado === estado)
  const sel = surtidos.filter(enRango).sort((a, b) => String(a.creado_en).localeCompare(String(b.creado_en)))
  const filas = []
  const colores = []
  for (const s of sel) {
    for (const l of lineas.filter((x) => x.surtido_id === s.id).sort((a, b) => a.clave.localeCompare(b.clave))) {
      filas.push([s.numero_oc, s.planta, ESTADO_SURT[s.estado], fecha(s.fecha_oc), fecha(s.fecha_limite), s.surtido_por_nombre || '', s.remision || '', fecha(s.fecha_entrega), l.clave, prod.get(l.producto_id)?.nombre || '', l.cantidad])
      colores.push(prod.get(l.producto_id) || null)
    }
  }
  return {
    titulo: 'Órdenes de surtido',
    nota: `Creadas del ${desde || 'inicio'} al ${hasta || 'hoy'}${estado && estado !== 'todos' ? ` · ${ESTADO_SURT[estado]}s` : ''}. Un renglón por clave.`,
    columnas: [{ titulo: 'OC' }, { titulo: 'Planta' }, { titulo: 'Estado' }, { titulo: 'Fecha OC' }, { titulo: 'Límite' }, { titulo: 'Surtió' }, { titulo: 'Remisión' }, { titulo: 'Entregada' }, { titulo: 'Clave' }, { titulo: 'Nombre' }, { titulo: 'Piezas', num: true }],
    filas,
    colores,
    totales: { Órdenes: sel.length, Piezas: filas.reduce((t, f) => t + f[10], 0) },
  }
}

export function reporteRestock(filasRestock) {
  const sel = filasRestock.filter((f) => f.aPedir > 0 || f.enProceso > 0 || f.porEntrar > 0)
  return {
    titulo: 'Restock',
    nota: 'Proyectado = disponible + en proceso + por entrar. A PEDIR = máximo - proyectado cuando el proyectado llega al reorden.',
    columnas: [{ titulo: 'Clave' }, { titulo: 'Nombre' }, { titulo: 'Disponible', num: true }, { titulo: 'En proceso', num: true }, { titulo: 'Por entrar', num: true }, { titulo: 'Proyectado', num: true }, { titulo: 'Reorden', num: true }, { titulo: 'Máximo', num: true }, { titulo: 'A PEDIR', num: true }, { titulo: 'Se' }],
    filas: sel.map((f) => [f.producto.clave, f.producto.nombre, f.disponible, f.enProceso, f.porEntrar, f.proyectado, f.reorden, f.maximo, f.aPedir, f.se === 'fabrica' ? 'Taller' : 'Compra']),
    colores: sel.map((f) => f.producto),
    totales: { 'A pedir (taller)': sel.filter((f) => f.se === 'fabrica').reduce((t, f) => t + f.aPedir, 0), 'A pedir (compra)': sel.filter((f) => f.se === 'compra').reduce((t, f) => t + f.aPedir, 0) },
  }
}

export function reporteLisas(filasLisas) {
  return {
    titulo: 'Playera lisa (sin procesos)',
    nota: 'Stock = en el anaquel (se descuentan al crear la orden de taller). A comprar = lo que piden las órdenes de taller propuestas - stock.',
    columnas: [{ titulo: 'Color' }, { titulo: 'Manga' }, { titulo: 'Talla' }, { titulo: 'Stock', num: true }, { titulo: 'En proceso', num: true }, { titulo: 'Piden', num: true }, { titulo: 'A comprar', num: true }, { titulo: 'La usan' }],
    filas: filasLisas.map((f) => [f.lisa.color, f.lisa.manga, f.lisa.talla, f.stock, f.enProceso, f.piden, f.aComprar, f.productos.join(', ')]),
    colores: filasLisas.map((f) => ({ tipo: 'Playera', color: f.lisa.color, nombre: 'PLAYERA' })),
    totales: { Stock: filasLisas.reduce((t, f) => t + f.stock, 0), 'A comprar': filasLisas.reduce((t, f) => t + f.aComprar, 0) },
  }
}

export function reporteCompras(compras, lineas, lineasLisa, { productos = [], lisas = [] }) {
  const prod = new Map(productos.map((p) => [p.id, p]))
  const lisa = new Map(lisas.map((l) => [l.id, l]))
  const EST = { pedida: 'Pedida', recibida: 'Recibida', cancelada: 'Cancelada' }
  const filas = []
  const colores = []
  for (const c of [...compras].sort((a, b) => a.folio - b.folio)) {
    for (const l of lineas.filter((x) => x.compra_id === c.id)) {
      filas.push([c.folio, c.proveedor, EST[c.estado], fecha(c.creado_en), fecha(c.fecha_esperada), fecha(c.recibido_en), l.clave, prod.get(l.producto_id)?.nombre || '', l.cantidad, l.recibida ?? ''])
      colores.push(prod.get(l.producto_id) || null)
    }
    for (const l of lineasLisa.filter((x) => x.compra_id === c.id)) {
      const li = lisa.get(l.lisa_id)
      filas.push([c.folio, c.proveedor, EST[c.estado], fecha(c.creado_en), fecha(c.fecha_esperada), fecha(c.recibido_en), 'Playera lisa', li ? nombreLisa(li) : '', l.cantidad, l.recibida ?? ''])
      colores.push(li ? { tipo: 'Playera', color: li.color, nombre: 'PLAYERA' } : null)
    }
  }
  return {
    titulo: 'Pedidos de compra',
    nota: 'Pantalón y lo que se compra hecho, y playera lisa.',
    columnas: [{ titulo: 'Folio', num: true }, { titulo: 'Proveedor' }, { titulo: 'Estado' }, { titulo: 'Pedida' }, { titulo: 'Se espera' }, { titulo: 'Recibida' }, { titulo: 'Clave' }, { titulo: 'Nombre' }, { titulo: 'Pedidas', num: true }, { titulo: 'Llegaron', num: true }],
    filas,
    colores,
    totales: { Pedidos: compras.length },
  }
}

const csvCampo = (v) => {
  const s = String(v ?? '')
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function reporteCSV(rep) {
  const lineas = [rep.columnas.map((c) => csvCampo(c.titulo)).join(','), ...rep.filas.map((f) => f.map(csvCampo).join(','))]
  return '﻿' + lineas.join('\r\n') + '\r\n'
}

export function nombreArchivo(rep, ext) {
  const d = new Date()
  const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const base = rep.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `SALPER-Frisa-${base}-${hoy}.${ext}`
}

// Órdenes pendientes contra el inventario: por clave, lo que piden, lo que hay y lo que falta producir.
// urgente: calcularUrgente(...) (reparte el disponible de la OC que vence primero a la última).
export function reportePorSurtir(urgente) {
  const ordenesPorClave = new Map()
  for (const o of urgente.ordenes) for (const l of o.lineas) ordenesPorClave.set(l.producto_id, (ordenesPorClave.get(l.producto_id) || 0) + 1)
  const filas = [...urgente.porClave].sort((a, b) => b.falta - a.falta || String(a.producto.clave).localeCompare(String(b.producto.clave)))
  const piezasPend = filas.reduce((t, c) => t + c.pendiente, 0)
  const cubiertas = filas.reduce((t, c) => t + Math.min(c.pendiente, Math.max(0, c.disponible)), 0)
  const completas = urgente.ordenes.filter((o) => o.completa)
  return {
    titulo: 'Por surtir contra inventario',
    nota: `${urgente.ordenes.length} órdenes pendientes. Con el inventario de hoy se pueden surtir completas ${completas.length} `
      + `(${completas.reduce((t, o) => t + o.lineas.reduce((x, l) => x + l.cantidad, 0), 0).toLocaleString('es-MX')} pzas), repartiendo de la que vence primero a la última. `
      + 'Hay = disponible en bodega (real - apartado de órdenes ya surtidas). Falta producir = por surtir - hay.',
    columnas: [{ titulo: 'Clave' }, { titulo: 'Artículo' }, { titulo: 'Nombre' }, { titulo: 'Órdenes', num: true },
      { titulo: 'Por surtir', num: true }, { titulo: 'Hay', num: true }, { titulo: 'Falta producir', num: true }],
    filas: [...filas.map((c) => [c.producto.clave, c.producto.articulo || '', c.producto.nombre, ordenesPorClave.get(c.producto.id) || 0,
      c.pendiente, Math.max(0, c.disponible), c.falta]),
    ['TOTAL', '', `${filas.length} claves`, urgente.ordenes.length, piezasPend, filas.reduce((t, c) => t + Math.max(0, c.disponible), 0), urgente.piezasFaltantes]],
    colores: [...filas.map((c) => c.producto), null],
    totales: {
      'Órdenes pendientes': urgente.ordenes.length,
      'Se pueden surtir': completas.length,
      'Piezas por surtir': piezasPend,
      'Cubiertas con lo que hay': cubiertas,
      'Falta producir': urgente.piezasFaltantes,
    },
  }
}
