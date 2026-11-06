// node --test src/utils/reportePendientes.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorCliente, diasParaEntrega, pendientesDeEntrega, piezasDeOrden, prendasDeOrden, sinEmpezar } from './reportePendientes.js'

const orders = [
  { id: 'a', client_name: 'Colegio Uno', status: 'en_corte', requested_delivery_date: '2026-11-20', items: [{ garment: 'Playera', sizes: [{ talla: 'M', cantidad: '10' }, { talla: '', cantidad: '' }] }] },
  { id: 'b', client_name: 'colegio uno ', status: 'confirmado', requested_delivery_date: '2026-11-10', items: [{ garment: 'Short', color: 'Azul', sizes: [{ talla: 'CH', cantidad: 5 }, { talla: 'G', cantidad: 2 }] }] },
  { id: 'c', client_name: 'Fábrica X', status: 'en_confirmacion', requested_delivery_date: '2026-11-05', items: [{ garment: 'Playera', comprada: true, sizes: [{ talla: 'M', cantidad: 3 }] }] },
  { id: 'd', client_name: 'Entregada', status: 'completado', items: [] },
  { id: 'e', client_name: 'Cancelada', status: 'confirmado', cancelled_at: '2026-11-01', items: [] },
]
const etapas = [
  { order_id: 'a', estado: 'en_proceso' },
  { order_id: 'b', estado: 'pendiente' },
  { order_id: 'b', estado: 'pendiente' },
]

test('pendientes de entrega: sin entregadas ni canceladas', () => {
  assert.deepEqual(pendientesDeEntrega(orders).map((o) => o.id), ['a', 'b', 'c'])
})

test('sin empezar: ninguna etapa en proceso o completada (o sin etapas)', () => {
  assert.deepEqual(sinEmpezar(orders, etapas).map((o) => o.id), ['b', 'c'])
  assert.deepEqual(sinEmpezar(orders, [...etapas, { order_id: 'b', estado: 'completado' }]).map((o) => o.id), ['c'])
})

test('agrupa por cliente (sin importar mayúsculas/espacios) y ordena por entrega', () => {
  const g = agruparPorCliente(pendientesDeEntrega(orders))
  assert.deepEqual(g.map((x) => [x.cliente, x.ordenes.map((o) => o.id), x.piezas]), [
    ['Fábrica X', ['c'], 3],
    ['Colegio Uno', ['b', 'a'], 17],
  ])
})

test('prendas y piezas', () => {
  assert.equal(piezasDeOrden(orders[1]), 7)
  assert.deepEqual(prendasDeOrden(orders[1]), [{ nombre: 'Short Azul', tallas: 'CH 5 · G 2' }])
  assert.deepEqual(prendasDeOrden(orders[2]), [{ nombre: 'Playera (comprada)', tallas: 'M 3' }])
})

test('días para la entrega', () => {
  assert.equal(diasParaEntrega('2026-11-10', '2026-11-05'), 5)
  assert.equal(diasParaEntrega('2026-11-01', '2026-11-05'), -4)
  assert.equal(diasParaEntrega(null, '2026-11-05'), null)
})
