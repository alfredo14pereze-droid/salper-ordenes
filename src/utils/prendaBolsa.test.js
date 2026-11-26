import test from 'node:test'
import assert from 'node:assert/strict'
import { bolsaDePrenda, nombrePrendaCompleto } from './prendaBolsa.js'

test('bolsa sale del nombre del producto del catálogo', () => {
  assert.equal(bolsaDePrenda({ producto_nombre: 'Bata sin bolsa Azul Cielo' }), 'Sin bolsa')
  assert.equal(bolsaDePrenda({ producto_nombre: 'Bata con bolsa Café' }), 'Con bolsa')
  assert.equal(bolsaDePrenda({ producto_nombre: 'Playera polo' }), '')
  assert.equal(bolsaDePrenda({}), '')
})

test('nombre completo: prenda · color · bolsa', () => {
  assert.equal(nombrePrendaCompleto({ garment: 'Bata', color: 'Azul Cielo', producto_nombre: 'Bata sin bolsa Azul Cielo' }), 'Bata · Azul Cielo · Sin bolsa')
  assert.equal(nombrePrendaCompleto({ garment: 'Playera', color: '' }), 'Playera')
  assert.equal(nombrePrendaCompleto({}, 'Prenda 2'), 'Prenda 2')
})
