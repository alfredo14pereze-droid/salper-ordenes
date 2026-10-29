import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ordenesDelLote, reporteDeLote, telasDeOrden } from './loteImpresion.js'

test('telasDeOrden sin repetir ni vacías', () => {
  assert.deepEqual(telasDeOrden({ items: [{ tela_nombre: 'Lycra' }, { tela_nombre: ' Lycra ' }, { tela_nombre: '' }, { tela_nombre: 'Dry fit' }] }), ['Lycra', 'Dry fit'])
  assert.deepEqual(telasDeOrden({}), [])
})

test('reporteDeLote convierte los números', () => {
  const r = reporteDeLote({ largo_m: '3.200', tinta_azul_ml: '2.5', tinta_magenta_ml: '1', tinta_amarillo_ml: '0', tinta_negro_ml: '1.8', tinta_total_ml: '5.300' })
  assert.deepEqual(r, { largo: 3.2, azul: 2.5, magenta: 1, amarillo: 0, negro: 1.8, total: 5.3 })
  assert.equal(reporteDeLote(null), null)
})

test('ordenesDelLote usa el folio guardado aunque falte la orden', () => {
  const lote = { order_ids: ['a', 'b'], folios: ['SUB-1', 'SUB-2'] }
  const r = ordenesDelLote(lote, [{ id: 'a', order_number: 'SUB-1', client_name: 'Club', items: [{ tela_nombre: 'Lycra' }] }])
  assert.deepEqual(r, [
    { id: 'a', folio: 'SUB-1', cliente: 'Club', telas: ['Lycra'] },
    { id: 'b', folio: 'SUB-2', cliente: '', telas: [] },
  ])
})
