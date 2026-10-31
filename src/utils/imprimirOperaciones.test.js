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
