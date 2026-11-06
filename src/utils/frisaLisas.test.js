import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularLisas, buscadorLisa, nombreLisa } from './frisaLisas.js'

const productoLisa = [
  { producto_frisa_id: 'ML', color: 'Azul marino', manga: 'ML', proveedor: 'Máxima' },
  { producto_frisa_id: 'SRML', color: 'Azul marino', manga: 'ML', proveedor: null },
  { producto_frisa_id: 'VE', color: 'Verde', manga: 'MC', proveedor: null },
]
const lisas = [
  { id: 'mlM', color: 'Azul marino', manga: 'ML', talla: 'M', stock: 100 },
  { id: 'mlL', color: 'Azul marino', manga: 'ML', talla: 'L', stock: 0 },
  { id: 'veM', color: 'Verde', manga: 'MC', talla: 'M', stock: 10 },
]
const productosFrisa = [{ id: 'ML', codigo: 'FR-PLA-AM-ML' }, { id: 'SRML', codigo: 'FR-PLA-AM-SR-ML' }, { id: 'VE', codigo: 'FR-PLA-VE-MC' }]

test('dos productos comparten la misma lisa', () => {
  const b = buscadorLisa(productoLisa, lisas)
  assert.equal(b('ML', 'm').id, 'mlM')
  assert.equal(b('SRML', 'M').id, 'mlM')
  assert.equal(b('VE', 'L'), null)
  assert.equal(nombreLisa(lisas[0]), 'Playera lisa Azul marino manga larga talla M')
})

test('stock (anaquel), en proceso y a comprar', () => {
  const orders = [
    { id: 'o1', producto_frisa_id: 'ML', items: [{ sizes: [{ talla: 'M', cantidad: 60 }] }] },
    { id: 'o2', producto_frisa_id: 'SRML', items: [{ sizes: [{ talla: 'M', cantidad: 30 }] }] },
    { id: 'o3', producto_frisa_id: 'ML', items: [{ sizes: [{ talla: 'M', cantidad: 999 }] }] }, // ya subida
  ]
  const ligas = [{ order_id: 'o1' }, { order_id: 'o2' }, { order_id: 'o3', ingresado_en: 'x' }]
  const talleresPropuestos = [
    { producto_frisa_id: 'ML', lineas: [{ talla: 'M', cantidad: 40 }, { talla: 'L', cantidad: 25 }] },
    { producto_frisa_id: 'SRML', lineas: [{ talla: 'M', cantidad: 5 }] },
    { producto_frisa_id: 'VE', lineas: [{ talla: 'M', cantidad: 4 }] },
  ]
  const r = calcularLisas({ lisas, productoLisa, productosFrisa, ligas, orders, talleresPropuestos })
  const f = Object.fromEntries(r.filas.map((x) => [x.lisa.id, x]))
  assert.deepEqual([f.mlM.enProceso, f.mlM.stock, f.mlM.piden, f.mlM.aComprar], [90, 100, 45, 0])
  assert.deepEqual([f.mlL.stock, f.mlL.piden, f.mlL.aComprar], [0, 25, 25])
  assert.deepEqual([f.veM.stock, f.veM.piden, f.veM.aComprar], [10, 4, 0])
  assert.deepEqual(f.mlM.productos, ['FR-PLA-AM-ML', 'FR-PLA-AM-SR-ML'])
  assert.equal(r.pedidos.length, 1)
  assert.equal(r.pedidos[0].proveedor, 'Máxima')
  assert.deepEqual(r.pedidos[0].lineas.map((l) => [l.lisa_id, l.cantidad]), [['mlL', 25]])
})
