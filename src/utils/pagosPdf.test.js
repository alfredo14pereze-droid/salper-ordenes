// node --test src/utils/pagosPdf.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { marcasDePrenda, resumenPagosPdf, rosterParaPdf } from './pagosPdf.js'

test('sin total ni anticipos no hay sección', () => {
  assert.equal(resumenPagosPdf({ total_orden: null }, { anticipos: 0, renglones: [] }), null)
  assert.equal(resumenPagosPdf({}, null), null)
})

test('total capturado a mano y anticipo', () => {
  assert.deepEqual(resumenPagosPdf({ total_orden: 5000 }, { anticipos: 1500, renglones: [], total: 0 }), { subtotal: null, iva: null, total: 5000, anticipos: 1500, saldo: 3500 })
})

test('con precios por prenda mandan los totales calculados', () => {
  const totales = { renglones: [{}], requiere_factura: true, subtotal: 3512.93, iva: 562.07, total: 4075, anticipos: 1000 }
  assert.deepEqual(resumenPagosPdf({ total_orden: 9999 }, totales), { subtotal: 3512.93, iva: 562.07, total: 4075, anticipos: 1000, saldo: 3075 })
  assert.deepEqual(resumenPagosPdf({}, { ...totales, requiere_factura: false }), { subtotal: null, iva: null, total: 4075, anticipos: 1000, saldo: 3075 })
})

test('solo anticipo, sin total', () => {
  assert.deepEqual(resumenPagosPdf({}, { anticipos: 800, renglones: [] }), { subtotal: null, iva: null, total: null, anticipos: 800, saldo: null })
})

test('roster: solo filas con nombre o número, y solo si la prenda lo lleva', () => {
  const roster = [{ talla: 'M', nombre: 'Ana', numero: '7' }, { talla: 'L', nombre: '', numero: '' }, { talla: '', nombre: '', numero: '10' }]
  assert.equal(rosterParaPdf({ tiene_roster: true, roster }).length, 2)
  assert.deepEqual(rosterParaPdf({ tiene_roster: false, roster }), [])
  assert.deepEqual(rosterParaPdf({}), [])
})

test('bordados e impresiones: solo si la prenda los lleva y traen foto o lugar', () => {
  const item = {
    lleva_bordado: true,
    bordados: [{ foto_url: 'a.jpg', ubicacion: 'Pecho' }, { foto_url: '', ubicacion: '  ' }, { ubicacion: 'Manga' }, null],
    lleva_impresion: false,
    impresiones: [{ foto_url: 'b.jpg', ubicacion: 'Espalda' }],
  }
  assert.equal(marcasDePrenda(item, 'bordado').length, 2)
  assert.deepEqual(marcasDePrenda(item, 'impresion'), [])
  assert.equal(marcasDePrenda({ ...item, lleva_impresion: true }, 'impresion').length, 1)
  assert.deepEqual(marcasDePrenda({}, 'bordado'), [])
})
