// node --test src/utils/preciosLineas.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filasDeFormulario,
  filasDeRenglones,
  lineasDeFilas,
  lineasParaGuardar,
  marcarMostrador,
  mensajeFaltanPrecios,
  resumenPago,
  tipoLlevaPrecio,
} from './preciosLineas.js'

const items = [
  {
    garment: 'Playera',
    sizes: [
      { talla: '14', cantidad: '10', precio_unitario: '250' },
      { talla: '', cantidad: '' }, // fila vacía del editor: no cuenta
      { talla: 'CH', cantidad: '5', precio_unitario: '280' },
    ],
  },
  { garment: 'Playera', sizes: [{ talla: '14', cantidad: '2', precio_unitario: '300' }] },
]

test('misma prenda con distinto precio por talla y en dos renglones', () => {
  const filas = filasDeFormulario(items)
  assert.equal(filas.length, 3)
  assert.deepEqual(filas.map((f) => f.subtotal), [2500, 1400, 600])
  const r = resumenPago(filas, 1000)
  assert.equal(r.total, 4500)
  assert.equal(r.saldo, 3500)
  assert.equal(r.sinPrecio.length, 0)
})

test('las líneas que se guardan cuentan solo tallas guardadas (índices de la base)', () => {
  assert.deepEqual(lineasParaGuardar(items), [
    { item_index: 0, size_index: 0, precio_unitario: 250, venta_mostrador: false },
    { item_index: 0, size_index: 1, precio_unitario: 280, venta_mostrador: false },
    { item_index: 1, size_index: 0, precio_unitario: 300, venta_mostrador: false },
  ])
})

test('mostrador: no pide precio, no suma y no bloquea', () => {
  const conMostrador = [
    { garment: 'Short', sizes: [marcarMostrador({ talla: 'M', cantidad: '3', precio_unitario: '99' }, true)] },
    { garment: 'Playera', sizes: [{ talla: '14', cantidad: '2', precio_unitario: '' }] },
  ]
  const filas = filasDeFormulario(conMostrador)
  assert.equal(filas[0].ventaMostrador, true)
  assert.equal(filas[0].precioUnitario, null)
  assert.equal(resumenPago(filas).total, 0)
  assert.match(mensajeFaltanPrecios(filas, 'escolar'), /Playera 14/)
  assert.doesNotMatch(mensajeFaltanPrecios(filas, 'escolar'), /Short/)
  assert.equal(lineasParaGuardar(conMostrador)[0].precio_unitario, null)
  assert.equal(lineasParaGuardar(conMostrador)[0].venta_mostrador, true)
})

test('solo mostrador: no hay cobro (no aplica anticipo)', () => {
  const filas = filasDeFormulario([{ garment: 'Short', sizes: [{ talla: 'M', cantidad: '3', venta_mostrador: true }] }])
  assert.equal(resumenPago(filas).hayCobro, false)
  assert.equal(mensajeFaltanPrecios(filas, 'escolar'), null)
})

test('precio 0 o vacío cuenta como faltante; tipos sin precio no exigen', () => {
  const filas = filasDeFormulario([{ garment: 'Playera', sizes: [{ talla: 'M', cantidad: '3', precio_unitario: '0' }] }])
  assert.match(mensajeFaltanPrecios(filas, 'sublimacion'), /Playera M/)
  assert.equal(mensajeFaltanPrecios(filas, 'frisa'), null)
  assert.equal(mensajeFaltanPrecios(filas, 'venta_mostrador'), null)
  assert.equal(tipoLlevaPrecio('maquila'), true)
})

test('detalle: filas desde orden_totales y de vuelta a líneas', () => {
  const renglones = [
    { item_index: 0, size_index: 0, prenda: 'Playera', talla: '14', cantidad: 15, precio_unitario: 200, venta_mostrador: false, extras_por_pieza: 20, subtotal_renglon: 3300 },
    { item_index: 1, size_index: 0, prenda: 'Short', talla: 'M', cantidad: 3, precio_unitario: null, venta_mostrador: false, extras_por_pieza: 0, subtotal_renglon: 0 },
  ]
  const filas = filasDeRenglones(renglones)
  assert.equal(resumenPago(filas).total, 3300) // precio + extras de V77
  assert.equal(resumenPago(filas).sinPrecio.length, 1)
  filas[1] = { ...filas[1], ventaMostrador: true }
  assert.equal(resumenPago(filas).sinPrecio.length, 0)
  assert.deepEqual(lineasDeFilas(filas), [
    { item_index: 0, size_index: 0, precio_unitario: 200, venta_mostrador: false },
    { item_index: 1, size_index: 0, precio_unitario: null, venta_mostrador: true },
  ])
})

test('V161: precio vacío o 0 se manda como null (queda "falta precio")', () => {
  const lineas = lineasParaGuardar([{ garment: 'Playera', sizes: [{ talla: 'M', cantidad: '3', precio_unitario: '' }, { talla: 'G', cantidad: '2', precio_unitario: '0' }] }])
  assert.deepEqual(lineas.map((l) => l.precio_unitario), [null, null])
})
