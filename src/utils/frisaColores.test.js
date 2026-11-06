import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colorPlayera } from './frisaColores.js'

test('color de cada playera', () => {
  assert.equal(colorPlayera({ tipo: 'Playera', color: 'Roja', nombre: 'PLAYERA C/R M/C S/REFLEJANTE 2 IMP. ROJA FRISA T-M' }), 'roja')
  assert.equal(colorPlayera({ tipo: 'Playera', color: 'Mango', nombre: 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. ORO MANGO FRISA T-S' }), 'amarilla')
  assert.equal(colorPlayera({ tipo: 'Playera', color: 'Verde', nombre: 'PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-L' }), 'verde')
  assert.equal(colorPlayera({ tipo: 'Playera', color: 'Azul marino', nombre: 'PLAYERA C/R M/L S/REFLEJANTE 1 IMP. AZUL M. FRISA T-XL' }), 'marino')
  assert.equal(colorPlayera({ nombre: 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. A.MARINO FRISA T-M' }), 'marino')
})

test('lo que no es playera no lleva color', () => {
  assert.equal(colorPlayera({ tipo: 'Camisa', color: 'Mezclilla', nombre: 'CAMISA DE MEZCLILLA FRISA T-M' }), null)
  assert.equal(colorPlayera({ tipo: 'Pantalón', color: 'Mezclilla', nombre: 'PANTALON DE MEZCLILLA TALLA 32' }), null)
  assert.equal(colorPlayera(null), null)
})
