import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colorProductoFrisa } from './frisaColores.js'

const color = (p) => colorProductoFrisa(p)?.nombre ?? null

test('color de cada producto, igual que las etiquetas', () => {
  assert.equal(color({ nombre: 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. A.MARINO FRISA T-M' }), 'Celeste')
  assert.equal(color({ nombre: 'PLAYERA C/R M/L C/REFLEJANTE 1 IMP. A.MARINO FRISA T-M' }), 'Azul rey')
  assert.equal(color({ tipo: 'Playera', color: 'Azul marino', nombre: 'PLAYERA C/R M/L S/REFLEJANTE 1 IMP. AZUL M. FRISA T-XL' }), 'Marino')
  assert.equal(color({ nombre: 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. ORO MANGO FRISA T-S' }), 'Amarillo')
  assert.equal(color({ nombre: 'PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-L' }), 'Verde')
  assert.equal(color({ nombre: 'PLAYERA C/R M/C S/REFLEJANTE 2 IMP. ROJA FRISA T-M' }), 'Rojo')
  assert.equal(color({ nombre: 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B FRISA T-M' }), 'Morado')
  assert.equal(color({ nombre: 'CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B 1I FRISA NUEVO INGRESO T-XL' }), 'Naranja')
  assert.equal(color({ nombre: 'PANTALON DE MEZCLILLA TALLA 32 14OZ FRISA' }), 'Café')
  assert.equal(color({ nombre: 'PANTALON DE MEZCLILLA TALLA 32 14OZ FRISA LARGO 34' }), 'Rosa fucsia')
  assert.equal(color({ nombre: 'BOLSA DE MEZCLILLA CON CIERRE FRISA' }), 'Gris')
  assert.equal(color({ nombre: 'BATA LABORATORIO FRISA T-L' }), 'Blanco')
})

test('reflejante, nombres del taller y lo que no tiene color', () => {
  assert.equal(colorProductoFrisa({ nombre: 'PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-L' }).reflejante, true)
  assert.equal(colorProductoFrisa({ nombre: 'PLAYERA C/R M/C S/REFLEJANTE 2 IMP. ROJA FRISA T-M' }).reflejante, false)
  assert.equal(colorProductoFrisa({ nombre: 'CAMISA DE MEZCLILLA FRISA T-M' }).reflejante, true)
  assert.equal(color({ nombre: 'Playera C/REF A. Marino M/C' }), 'Celeste')
  assert.equal(color({ nombre: 'Playera S/REF Roja M/C' }), 'Rojo')
  assert.equal(color({ nombre: 'PLAYERA M/C S/REFLEJANTE A.MARINO FRISA T-M' }), null)
  assert.equal(colorProductoFrisa({ tipo: 'Playera', color: 'Azul marino', nombre: 'AZUL MARINO MANGA LARGA', insumo: true }).sinMuestra, true)
  assert.equal(colorProductoFrisa({ nombre: 'PANTALON DE MEZCLILLA TALLA 32 14OZ FRISA' }).fondo, '#EFE7E3')
  assert.equal(color({ tipo: 'Playera', color: 'Roja', nombre: 'ROJA MANGA CORTA', insumo: true }), 'Rojo')
  assert.equal(color({ nombre: 'GORRA FRISA' }), null)
  assert.equal(colorProductoFrisa(null), null)
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
