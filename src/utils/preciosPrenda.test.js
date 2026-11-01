// node --test src/utils/preciosPrenda.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agregarGrupo,
  alternarTalla,
  aplicarPrecios,
  cambiarModo,
  cambiarPrecioGrupo,
  estadoDeItem,
  estadoDesdePrecios,
  grupoDeTalla,
  precioDeTalla,
  quitarGrupo,
  sinDatosDePrecio,
  tallasDeItem,
  tallasSinPrecio,
} from './preciosPrenda.js'
import { esOrdenMostrador, filasDeFormulario, lineasParaGuardar, ordenEsMostradorPorClaves } from './preciosLineas.js'

const item = {
  garment: 'Playera',
  sizes: [
    { talla: '10', cantidad: '5' },
    { talla: '12', cantidad: '4' },
    { talla: '', cantidad: '' },
    { talla: 'CH', cantidad: '3' },
    { talla: 'M', cantidad: '0' },
  ],
}

test('tallas con cantidad, en orden', () => {
  assert.deepEqual(tallasDeItem(item), ['10', '12', 'CH'])
})

test('mismo precio se aplica a todas las tallas con cantidad', () => {
  const conPrecio = aplicarPrecios({ ...item, precios: { modo: 'mismo', unico: '250', grupos: [] } })
  const filas = filasDeFormulario([conPrecio])
  assert.deepEqual(filas.map((f) => f.precioUnitario), [250, 250, 250])
  assert.equal(filas.reduce((s, f) => s + f.subtotal, 0), 3000)
})

test('precios por talla: grupos, talla en un solo grupo, sin precio', () => {
  let e = cambiarModo({ modo: 'mismo', unico: '250', grupos: [] }, 'tallas', ['10', '12', 'CH'])
  assert.deepEqual(e.grupos, [{ precio: '250', tallas: ['10', '12', 'CH'] }])
  e = alternarTalla(e, 0, 'CH') // la saca del grupo 1
  e = agregarGrupo(e)
  assert.deepEqual(tallasSinPrecio(e, ['10', '12', 'CH']), ['CH'])
  e = alternarTalla(e, 1, 'CH')
  e = cambiarPrecioGrupo(e, 1, '280')
  assert.equal(grupoDeTalla(e, 'CH'), 1)
  assert.equal(precioDeTalla(e, 'CH'), '280')
  assert.deepEqual(tallasSinPrecio(e, ['10', '12', 'CH']), [])
  // Marcarla en otro grupo la quita del anterior.
  e = alternarTalla(e, 0, 'CH')
  assert.equal(grupoDeTalla(e, 'CH'), 0)
  assert.deepEqual(e.grupos[1].tallas, [])
  e = quitarGrupo(e, 1)
  assert.equal(e.grupos.length, 1)
  const filas = filasDeFormulario([aplicarPrecios({ ...item, precios: e })])
  assert.deepEqual(filas.map((f) => f.precioUnitario), [250, 250, 250])
})

test('de "por talla" a "mismo" se queda el primer precio', () => {
  const e = cambiarModo({ modo: 'tallas', unico: '', grupos: [{ precio: '', tallas: [] }, { precio: '300', tallas: ['10'] }] }, 'mismo', [])
  assert.equal(e.unico, '300')
})

test('al editar: todas igual → mismo precio; distintas → agrupadas por precio', () => {
  assert.deepEqual(estadoDesdePrecios([{ talla: '10', precio: '250' }, { talla: '12', precio: 250 }]).modo, 'mismo')
  assert.equal(estadoDesdePrecios([{ talla: '10', precio: '250' }, { talla: '12', precio: 250 }]).unico, '250')
  assert.equal(estadoDesdePrecios([{ talla: '10', precio: '' }, { talla: '12', precio: null }]).modo, 'mismo')
  const e = estadoDesdePrecios([
    { talla: '10', precio: '250' },
    { talla: '12', precio: '280' },
    { talla: '14', precio: '250.00' },
    { talla: '16', precio: '' },
  ])
  assert.equal(e.modo, 'tallas')
  assert.deepEqual(e.grupos, [
    { precio: '250', tallas: ['10', '14'] },
    { precio: '280', tallas: ['12'] },
  ])
  assert.deepEqual(tallasSinPrecio(e, ['10', '12', '14', '16']), ['16'])
})

test('borrador de antes (precio en cada talla, sin `precios`)', () => {
  const viejo = { garment: 'Short', sizes: [{ talla: 'M', cantidad: 2, precio_unitario: '99', venta_mostrador: true }, { talla: 'G', cantidad: 1, precio_unitario: '120' }] }
  assert.equal(estadoDeItem(viejo).modo, 'tallas')
  const aplicado = aplicarPrecios(viejo)
  assert.equal(aplicado.sizes[0].venta_mostrador, undefined) // la marca por talla ya no se usa en el alta
  assert.deepEqual(lineasParaGuardar([aplicado]).map((l) => l.precio_unitario), [99, 120])
})

test('venta de mostrador de toda la orden: todas las líneas, sin precio', () => {
  const conPrecio = aplicarPrecios({ ...item, precios: { modo: 'mismo', unico: '250', grupos: [] } })
  const lineas = lineasParaGuardar([conPrecio], { ventaMostrador: true })
  assert.equal(lineas.length, 3)
  assert.ok(lineas.every((l) => l.venta_mostrador && l.precio_unitario === null))
  assert.deepEqual(lineas.map((l) => [l.item_index, l.size_index]), [[0, 0], [0, 1], [0, 2]])
})

test('sinDatosDePrecio quita la captura de precio de la prenda', () => {
  assert.deepEqual(sinDatosDePrecio({ garment: 'X', precios: { modo: 'mismo' }, sizes: [] }), { garment: 'X', sizes: [] })
})

test('¿la orden es de mostrador?', () => {
  assert.equal(esOrdenMostrador([]), false)
  assert.equal(esOrdenMostrador([{ ventaMostrador: true }, { ventaMostrador: true }]), true)
  assert.equal(esOrdenMostrador([{ ventaMostrador: true }, { ventaMostrador: false }]), false)
  const items = [{ sizes: [{ talla: '10', cantidad: 2 }, { talla: '12', cantidad: 1 }] }, { sizes: [{ talla: 'M', cantidad: 3 }] }]
  assert.equal(ordenEsMostradorPorClaves(items, new Set(['0:0', '0:1', '1:0'])), true)
  assert.equal(ordenEsMostradorPorClaves(items, new Set(['0:0', '1:0'])), false)
  assert.equal(ordenEsMostradorPorClaves(items, null), false)
  assert.equal(ordenEsMostradorPorClaves([], new Set()), false)
})
