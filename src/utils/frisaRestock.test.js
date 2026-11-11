import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularRestock, propuestaIngreso, tallasDeOrden, ordenTerminada, itemsOrdenRestock } from './frisaRestock.js'
import { CONFIG_INICIAL } from './frisaNiveles.js'

// consumo 289 en 289 días → 1/día: mínimo 20, reorden 28, máximo 42
const prod = (id, clave, disponible, extra = {}) => ({ id, clave, nombre: clave, consumo_2026: 289, disponible, ...extra })
const productosInv = [
  prod('m', 'PLAFR-000M-01MCMA1I', 10),
  prod('l', 'PLAFR-000L-01MCMA1I', 25),
  prod('xl', 'PLAFR-00XL-01MCMA1I', 40),
  prod('pan', 'PANFR-0032-01MEZ', 5),
]
const clavesProducto = [
  { producto_id: 'm', producto_frisa_id: 'AM', talla: 'M' },
  { producto_id: 'l', producto_frisa_id: 'AM', talla: 'L' },
  { producto_id: 'xl', producto_frisa_id: 'AM', talla: 'XL' },
]

// Por ciclo (2026-11-11). Demanda 1/día; mínimo 20, reorden 28, máximo 42.
// Playera (taller): se pide cada 7 y tarda 10 → siguiente llegada en 17 días; pantalón: 10 + 10 = 20.
test('por ciclo: estado con lo que habrá al llegar el siguiente pedido; pedir hasta el máximo al llegar', () => {
  const r = calcularRestock({ productosInv: [...productosInv, prod('pan2', 'PANFR-0034-01MEZ', 70)], cfg: CONFIG_INICIAL, clavesProducto })
  const f = Object.fromEntries(r.filas.map((x) => [x.producto.id, x]))
  assert.deepEqual([f.m.alSiguiente, f.m.estado, f.m.aPedir], [-7, 'critico', 42]) // 10 − 17; al llegar 0 → 42
  assert.deepEqual([f.l.alSiguiente, f.l.estado, f.l.aPedir], [8, 'critico', 27]) // al llegar 15 → 27
  assert.deepEqual([f.xl.alSiguiente, f.xl.estado, f.xl.aPedir], [23, 'pedir', 12]) // al llegar 30 → 12
  assert.deepEqual([f.pan.ciclo.cada, f.pan.alSiguiente, f.pan.estado, f.pan.aPedir], [10, -15, 'critico', 47])
  assert.deepEqual([f.pan2.alSiguiente, f.pan2.estado, f.pan2.aPedir], [50, 'ok', 0])
  assert.deepEqual(r.talleresPropuestos, [{ producto_frisa_id: 'AM', aPedir: 81, lineas: [
    { producto_id: 'm', clave: 'PLAFR-000M-01MCMA1I', talla: 'M', cantidad: 42, sugerido: 42 },
    { producto_id: 'l', clave: 'PLAFR-000L-01MCMA1I', talla: 'L', cantidad: 27, sugerido: 27 },
    { producto_id: 'xl', clave: 'PLAFR-00XL-01MCMA1I', talla: 'XL', cantidad: 12, sugerido: 12 },
  ] }])
  assert.equal(r.talleresTodos.length, 1)
  assert.deepEqual(r.compraPropuesta, [{ producto_id: 'pan', clave: 'PANFR-0032-01MEZ', cantidad: 47 }])
})

test('cerca: apenas arriba del reorden al llegar el siguiente pedido también se pide', () => {
  const r = calcularRestock({ productosInv: [prod('m', 'PLAFR-000M-01MCMA1I', 47)], cfg: CONFIG_INICIAL, clavesProducto })
  assert.deepEqual([r.filas[0].alSiguiente, r.filas[0].estado, r.filas[0].aPedir], [30, 'cerca', 5]) // 30 ≤ 34; al llegar 37 → 5
})

test('lo que ya está en proceso o por entrar cuenta: solo se pide lo que falta', () => {
  const orders = [
    { id: 'o1', status: 'en_proceso', producto_frisa_id: 'AM', items: [{ sizes: [{ talla: 'M', cantidad: 20 }] }] },
    { id: 'o2', status: 'confirmado', producto_frisa_id: 'AM', items: [{ sizes: [{ talla: 'm', cantidad: 5 }, { talla: 'L', cantidad: 20 }] }] },
    { id: 'o3', status: 'confirmado', producto_frisa_id: 'AM', items: [{ sizes: [{ talla: 'M', cantidad: 999 }] }] },
  ]
  const etapas = [{ order_id: 'o2', etapa: 'terminado', estado: 'completado' }]
  const ligas = [{ order_id: 'o1' }, { order_id: 'o2' }, { order_id: 'o3', ingresado_en: '2026-11-06' }]
  const compras = [{ id: 'c1', estado: 'pedida' }, { id: 'c2', estado: 'recibida' }]
  const compraLineas = [{ compra_id: 'c1', producto_id: 'pan', cantidad: 30 }, { compra_id: 'c2', producto_id: 'pan', cantidad: 100 }]
  const r = calcularRestock({ productosInv, cfg: CONFIG_INICIAL, clavesProducto, ligas, orders, etapas, compras, compraLineas })
  const f = Object.fromEntries(r.filas.map((x) => [x.producto.id, x]))
  assert.deepEqual([f.m.enProceso, f.m.porEntrar, f.m.proyectado, f.m.aPedir], [20, 5, 35, 17]) // al llegar 25 → 17 (sin la orden serían 42)
  assert.deepEqual([f.l.enProceso, f.l.porEntrar, f.l.proyectado, f.l.aPedir], [0, 20, 45, 7])
  assert.deepEqual([f.pan.enProceso, f.pan.proyectado, f.pan.aPedir], [30, 35, 17])
  assert.deepEqual(r.ordenes.map((o) => o.estado), ['en_proceso', 'por_entrar', 'en_bodega'])
})

test('tallas, terminada y propuesta de ingreso', () => {
  const o = { id: 'o', producto_frisa_id: 'AM', items: [{ sizes: [{ talla: 'M', cantidad: 3 }, { talla: 'L', cantidad: 0 }] }, { sizes: [{ talla: 'm', cantidad: 2 }, { talla: '3XL', cantidad: 4 }] }] }
  assert.deepEqual(tallasDeOrden(o), [{ talla: 'M', cantidad: 5 }, { talla: '3XL', cantidad: 4 }])
  assert.equal(ordenTerminada({ id: 'x', status: 'terminado' }), true)
  assert.equal(ordenTerminada({ id: 'x', status: 'en_proceso' }, [{ order_id: 'x', etapa: 'terminado', estado: 'en_proceso' }]), false)
  assert.deepEqual(propuestaIngreso(o, clavesProducto), { lineas: [{ producto_id: 'm', talla: 'M', cantidad: 5 }], sinClave: [{ talla: '3XL', cantidad: 4 }] })
})

test('items para crear la orden FR', () => {
  const it = itemsOrdenRestock({ id: 'AM', nombre: 'Playera', color: 'Azul marino' }, [{ talla: 'M', cantidad: 32 }, { talla: 'L', cantidad: 0 }])
  assert.equal(it.length, 1)
  assert.deepEqual(it[0].sizes, [{ talla: 'M', cantidad: 32 }])
  assert.equal(it[0].producto_frisa_id, 'AM')
})
