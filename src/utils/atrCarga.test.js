import test from 'node:test'
import assert from 'node:assert/strict'
import { adivinarColumnas, armarRenglones, emparejar, leerBata, leerCsv, normalizarTalla } from './atrCarga.js'

const productos = [
  { id: 'a', nombre: 'Bata con bolsa Blanca', color: 'Blanca', con_bolsa: true },
  { id: 'b', nombre: 'Bata sin bolsa Blanca', color: 'Blanca', con_bolsa: false },
  { id: 'c', nombre: 'Bata con bolsa Café', color: 'Café', con_bolsa: true },
  { id: 'd', nombre: 'Bata sin bolsa Verde Fosfo', color: 'Verde Fosfo', con_bolsa: false },
]

test('tallas', () => {
  assert.equal(normalizarTalla('Ch'), 'S') // V217: como Microsip
  assert.equal(normalizarTalla(' 2xl '), '2XL')
  assert.equal(normalizarTalla('XXL'), '2XL')
  assert.equal(normalizarTalla('s'), 'S')
  assert.equal(normalizarTalla('xs'), 'XS')
  assert.equal(normalizarTalla('5xl'), '5XL')
})

test('csv con punto y coma y comillas', () => {
  assert.deepEqual(leerCsv('Producto;Talla;Cantidad\r\n"Bata; rara";CH;3\n'), [
    ['Producto', 'Talla', 'Cantidad'],
    ['Bata; rara', 'CH', '3'],
  ])
})

test('columnas', () => {
  assert.deepEqual(adivinarColumnas(['Producto', 'Color', 'Talla', 'Cantidad']), { producto: 0, color: 1, talla: 2, cantidad: 3 })
  assert.equal(adivinarColumnas(['Artículo', 'Size', 'Existencia']).cantidad, 2)
})

test('leer bata', () => {
  assert.deepEqual(leerBata('BATA BLANCA C/BOLSA'), { bolsa: true, color: 'blanca' })
  assert.deepEqual(leerBata('Bata sin bolsa', 'Café'), { bolsa: false, color: 'cafe' })
})

test('emparejar', () => {
  assert.equal(emparejar('Bata con bolsa Blanca', '', productos)?.id, 'a')
  assert.equal(emparejar('Bata sin bolsa', 'Blanca', productos)?.id, 'b')
  assert.equal(emparejar('bata cafe c/bolsa', '', productos)?.id, 'c')
  assert.equal(emparejar('Bata sin bolsa', 'verde fosfo', productos)?.id, 'd')
  assert.equal(emparejar('Bata sin bolsa', 'Rosa', productos), null)
  assert.equal(emparejar('Bata Blanca', '', productos), null) // sin decir con/sin bolsa
})

test('renglones', () => {
  const filas = [['Producto', 'Color', 'Talla', 'Cantidad'], ['Bata con bolsa', 'Blanca', 'ch', '10'], ['Bata sin bolsa', 'Rosa', 'M', 2], ['', '', 'M', '1'], ['Bata con bolsa', 'Café', 'L', 'x']]
  const r = armarRenglones(filas, adivinarColumnas(filas[0]), productos)
  assert.equal(r[0].match.id, 'a')
  assert.equal(r[0].talla, 'S')
  assert.equal(r[1].match, null)
  assert.equal(r[1].cantidad, 2)
  assert.equal(r[2].error, 'Sin producto')
  assert.equal(r[3].error, 'Cantidad inválida')
})

test('carga con nombres de Microsip', () => {
  const cat = [
    { id: 'cb-ac', nombre: 'Bata con bolsa Azul Cielo', color: 'Azul Cielo', con_bolsa: true },
    { id: 'sb-ac', nombre: 'Bata sin bolsa Azul Cielo', color: 'Azul Cielo', con_bolsa: false },
    { id: 'cb-gr', nombre: 'Bata con bolsa Gris Rata', color: 'Gris Rata', con_bolsa: true },
    { id: 'cb-vs', nombre: 'Bata con bolsa Verde Supervisor', color: 'Verde Supervisor', con_bolsa: true },
    { id: 'sb-vg', nombre: 'Bata sin bolsa Verde Grasa', color: 'Verde Grasa', con_bolsa: false },
  ]
  assert.equal(emparejar('BATA C/BOLSA ATR AZUL CIELO T-2XL', '', cat)?.id, 'cb-ac')
  assert.equal(emparejar('BATA S/BOLSA ATR AZUL CIELO T-S', '', cat)?.id, 'sb-ac')
  assert.equal(emparejar('Con bolsa', 'A.CIELO', cat)?.id, 'cb-ac')
  assert.equal(emparejar('Con bolsa', 'GRIS', cat)?.id, 'cb-gr')
  assert.equal(emparejar('Con bolsa', 'V.SUPERVISOR', cat)?.id, 'cb-vs')
  assert.equal(emparejar('Sin bolsa', 'V,GRASA', cat)?.id, 'sb-vg')
})
