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

test('sin órdenes: A PEDIR = máximo − disponible en lo que está en PEDIR/CRÍTICO', () => {
  const r = calcularRestock({ productosInv, cfg: CONFIG_INICIAL, clavesProducto })
  const f = Object.fromEntries(r.filas.map((x) => [x.producto.id, x]))
  assert.deepEqual([f.m.estado, f.m.aPedir], ['critico', 32])
  assert.deepEqual([f.l.estado, f.l.aPedir], ['pedir', 17])
  assert.deepEqual([f.xl.estado, f.xl.aPedir], ['ok', 0])
  assert.equal(f.pan.se, 'compra')
  assert.deepEqual(r.talleresPropuestos, [{ producto_frisa_id: 'AM', lineas: [
    { producto_id: 'm', clave: 'PLAFR-000M-01MCMA1I', talla: 'M', cantidad: 32 },
    { producto_id: 'l', clave: 'PLAFR-000L-01MCMA1I', talla: 'L', cantidad: 17 },
  ] }])
  assert.deepEqual(r.compraPropuesta, [{ producto_id: 'pan', clave: 'PANFR-0032-01MEZ', cantidad: 37 }])
})

test('lo que ya está en proceso o por entrar no se vuelve a pedir', () => {
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
  assert.deepEqual([f.m.enProceso, f.m.porEntrar, f.m.proyectado, f.m.aPedir], [20, 5, 35, 0]) // 35 > reorden 28 → OK
  assert.deepEqual([f.l.enProceso, f.l.porEntrar, f.l.proyectado, f.l.aPedir], [0, 20, 45, 0])
  assert.deepEqual([f.pan.enProceso, f.pan.proyectado, f.pan.aPedir], [30, 35, 0])
  assert.deepEqual(r.ordenes.map((o) => o.estado), ['en_proceso', 'por_entrar', 'en_bodega'])
  assert.deepEqual(r.talleresPropuestos, [])
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
