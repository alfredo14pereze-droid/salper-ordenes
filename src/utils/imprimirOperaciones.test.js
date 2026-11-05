// node --test src/utils/imprimirOperaciones.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorParte, agruparPorPrenda, operacionesParaImprimir } from './imprimirOperaciones.js'

const ops = [
  { folio: 1312, prenda: 'OVEROL', parte: 'FRENTES', activa: true },
  { folio: 1301, prenda: 'OVEROL', parte: 'CUELLO', activa: true },
  { folio: 101, prenda: 'CAMISA', parte: 'CUELLO', activa: false },
  { folio: 102, prenda: 'CAMISA', parte: 'CUELLO', activa: true },
]

test('qué operaciones se imprimen', () => {
  const folios = (l) => l.map((o) => o.folio)
  assert.deepEqual(folios(operacionesParaImprimir(ops, { modo: 'todas' })), [102, 1301, 1312])
  assert.deepEqual(folios(operacionesParaImprimir(ops, { modo: 'todas', incluirInactivas: true })), [101, 102, 1301, 1312])
  assert.deepEqual(folios(operacionesParaImprimir(ops, { modo: 'visibles', visibles: [ops[0], ops[1]] })), [1301, 1312])
  assert.deepEqual(folios(operacionesParaImprimir(ops, { modo: 'marcadas', marcadas: new Set([1312, 101]) })), [1312])
  assert.deepEqual(folios(operacionesParaImprimir(ops, { modo: 'marcadas', marcadas: new Set() })), [])
})

test('una prenda por hoja', () => {
  const g = agruparPorPrenda(operacionesParaImprimir(ops, { modo: 'todas', incluirInactivas: true }))
  assert.deepEqual(g.map((x) => [x.prenda, x.operaciones.length]), [['CAMISA', 2], ['OVEROL', 2]])
})

test('hoja de una prenda agrupada por parte', () => {
  const g = agruparPorParte([
    { folio: 1005, parte: 'MANGA' },
    { folio: 1001, parte: 'CUELLO' },
    { folio: 1009, parte: 'cuello ' },
    { folio: 1003, parte: 'MANGA' },
    { folio: 1010, parte: '' },
  ])
  assert.deepEqual(g.map((x) => [x.parte, x.operaciones.map((o) => o.folio)]), [
    ['CUELLO', [1001, 1009]],
    ['MANGA', [1003, 1005]],
    ['SIN PARTE', [1010]],
  ])
})

test('V182: hoja con operaciones de varias prendas', async () => {
  const { conteoPorPrenda, prendaPrincipal, textoPorPrenda } = await import('./imprimirOperaciones.js')
  const mezcla = [
    { folio: 201, prenda: 'PLAYERA' }, { folio: 202, prenda: 'PLAYERA' },
    ...[501, 502, 503, 504, 505, 506, 507].map((folio) => ({ folio, prenda: 'CAMISOLA' })),
  ]
  assert.deepEqual(conteoPorPrenda(mezcla), [{ prenda: 'CAMISOLA', n: 7 }, { prenda: 'PLAYERA', n: 2 }])
  assert.equal(prendaPrincipal(mezcla), 'CAMISOLA')
  assert.equal(textoPorPrenda(mezcla), '7 de CAMISOLA y 2 de PLAYERA')
  // empate: gana la de folio más bajo
  assert.equal(prendaPrincipal([{ folio: 900, prenda: 'B' }, { folio: 100, prenda: 'A' }]), 'A')
  assert.equal(prendaPrincipal([]), null)
})

test('V182: operaciones de otra prenda se marcan y se agrupan con su parte', async () => {
  const { marcarOtraPrenda, agruparPorParte } = await import('./imprimirOperaciones.js')
  const ops = [
    { folio: 501, prenda: 'CAMISOLA', parte: 'CUELLO', operacion: 'Pegar cuello' },
    { folio: 201, prenda: 'PLAYERA', parte: 'Cuello', operacion: 'Pegar cuello playera' },
    { folio: 600, parte: 'MANGA', operacion: 'Copia vieja sin prenda' },
  ]
  const m = marcarOtraPrenda(ops, 'CAMISOLA')
  assert.equal(m[1].operacion, 'Pegar cuello playera (PLAYERA)')
  assert.equal(m[0].operacion, 'Pegar cuello')
  assert.equal(m[2].operacion, 'Copia vieja sin prenda')
  assert.deepEqual(agruparPorParte(m).map((g) => [g.parte, g.operaciones.map((o) => o.folio)]), [['Cuello', [201, 501]], ['MANGA', [600]]])
})
