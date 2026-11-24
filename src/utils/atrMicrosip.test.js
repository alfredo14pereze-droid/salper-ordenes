import test from 'node:test'
import assert from 'node:assert/strict'
import { compararMicrosip, leerReporteMicrosip } from './atrMicrosip.js'

const productos = [
  { id: 'cb-ac', nombre: 'Bata con bolsa Azul Cielo', color: 'Azul Cielo', con_bolsa: true },
  { id: 'sb-ac', nombre: 'Bata sin bolsa Azul Cielo', color: 'Azul Cielo', con_bolsa: false },
  { id: 'cb-gr', nombre: 'Bata con bolsa Gris', color: 'Gris', con_bolsa: true },
]

test('lee el reporte de Microsip: primer artículo del renglón y su existencia', () => {
  // Como la hoja "Report": nombre en A y C, unidad en H, existencia en L; al lado (R…) otro reporte.
  const filas = [
    ['SALPER', null, null, null, null, null, null, null, null, null, null, null, null, 46346],
    ['Existencia y valor del inventario'],
    ['BATA C/BOLSA ATR AZUL CIELO T-2XL', null, 'BATA C/BOLSA ATR AZUL CIELO T-2XL', null, null, null, null, 'Pza', null, null, null, 26, null, null, null, null, null, 'BATA C/BOLSA ATR AZUL CIELO T-XL', null, null, null, null, null, 'Pza', null, null, null, 1],
    ['BATA S/BOLSA ATR AZUL CIELO T-S', null, null, null, null, null, null, 'Pza', null, null, null, '0'],
    ['Total', null, null, null, null, null, null, null, null, null, null, 27],
  ]
  assert.deepEqual(leerReporteMicrosip(filas), [
    { texto: 'BATA C/BOLSA ATR AZUL CIELO T-2XL', cantidad: 26 },
    { texto: 'BATA S/BOLSA ATR AZUL CIELO T-S', cantidad: 0 },
  ])
})

test('compara contra la página por bata y talla', () => {
  const art = [
    { texto: 'BATA C/BOLSA ATR AZUL CIELO T-2XL', cantidad: 26 },
    { texto: 'BATA C/BOLSA ATR GRIS T-M', cantidad: 12 },
    { texto: 'BATA S/BOLSA ATR MORADA T-M', cantidad: 3 }, // no existe → sin ligar
  ]
  const ex = [
    { producto_id: 'cb-ac', talla: '2XL', existencia: 26 },
    { producto_id: 'cb-gr', talla: 'M', existencia: 10 },
    { producto_id: 'sb-ac', talla: 'S', existencia: 4 }, // solo en la página
  ]
  const { filas, sinLigar } = compararMicrosip(art, productos, ex)
  const f = (id, t) => filas.find((x) => x.producto.id === id && x.talla === t)
  assert.deepEqual([f('cb-ac', '2XL').microsip, f('cb-ac', '2XL').pagina, f('cb-ac', '2XL').diferencia], [26, 26, 0])
  assert.deepEqual([f('cb-gr', 'M').microsip, f('cb-gr', 'M').pagina, f('cb-gr', 'M').diferencia], [12, 10, -2])
  assert.deepEqual([f('sb-ac', 'S').microsip, f('sb-ac', 'S').pagina, f('sb-ac', 'S').diferencia], [0, 4, 4])
  assert.deepEqual(sinLigar.map((x) => x.texto), ['BATA S/BOLSA ATR MORADA T-M'])
})
