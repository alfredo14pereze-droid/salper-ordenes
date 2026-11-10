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

test('nombre para mostrar: manga corta/larga, sin C/R, con reflejante / lisa', async () => {
  const { nombreFrisa } = await import('./frisaColores.js')
  assert.equal(nombreFrisa('PLAYERA C/R M/C C/REFLEJANTE 1 IMP. A.MARINO FRISA T-L'), 'PLAYERA MANGA CORTA CON REFLEJANTE AZUL MARINO TALLA L')
  assert.equal(nombreFrisa('PLAYERA C/R M/L S/REFLEJANTE 1 IMP. AZUL M. FRISA T-M'), 'PLAYERA MANGA LARGA LISA AZUL MARINO TALLA M')
  assert.equal(nombreFrisa('CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B FRISA T-S'), 'CAMISA DE MEZCLILLA CON REFLEJANTE TALLA S')
  assert.equal(nombreFrisa('CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B 1I FRISA NUEVO INGRESO T-XL'), 'CAMISA DE MEZCLILLA NUEVO INGRESO TALLA XL')
  assert.equal(nombreFrisa('PANTALON DE MEZCLILLA TALLA 32 14OZ FRISA'), 'PANTALON DE MEZCLILLA TALLA 32')
  assert.equal(nombreFrisa('PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-M'), 'PLAYERA MANGA CORTA CON REFLEJANTE VERDE TALLA M')
})

test('nombres del taller: C/REF, S/REF y A. Marino', async () => {
  const { nombreFrisa } = await import('./frisaColores.js')
  assert.equal(nombreFrisa('Playera C/REF A. Marino M/C'), 'PLAYERA CON REFLEJANTE AZUL MARINO MANGA CORTA')
  assert.equal(nombreFrisa('Playera S/REF Roja M/C'), 'PLAYERA LISA ROJA MANGA CORTA')
})
