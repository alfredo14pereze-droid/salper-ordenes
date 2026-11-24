import test from 'node:test'
import assert from 'node:assert/strict'
import { limpiarFolioExterno, leerFolioSalper, variantesFolioSalper, esMismoFolioSalper, coincideFolioFrisa } from './folioExterno.js'
import { coincideBusquedaOrden } from './ordenesBusqueda.js'

test('limpiarFolioExterno quita espacios y vacío = null', () => {
  assert.equal(limpiarFolioExterno('  ORD3291 '), 'ORD3291')
  assert.equal(limpiarFolioExterno('   '), null)
  assert.equal(limpiarFolioExterno(null), null)
  assert.equal(limpiarFolioExterno('A 12/b'), 'A 12/b')
})

test('leerFolioSalper reconoce folios con o sin guion', () => {
  assert.deepEqual(leerFolioSalper('IND-054'), { prefijo: 'IND', numero: 54 })
  assert.deepEqual(leerFolioSalper('ind 54'), { prefijo: 'IND', numero: 54 })
  assert.deepEqual(leerFolioSalper('fr020'), { prefijo: 'FR', numero: 20 })
  assert.equal(leerFolioSalper('OC 4500-123'), null)
  assert.equal(leerFolioSalper('12345'), null)
  assert.equal(leerFolioSalper('FR-000'), null)
})

test('variantes y coincidencia exacta del folio SALPER', () => {
  const c = leerFolioSalper('fr 20')
  assert.ok(variantesFolioSalper(c).includes('FR-020'))
  assert.ok(variantesFolioSalper(c).includes('FR-20'))
  assert.equal(esMismoFolioSalper('FR-020', c), true)
  assert.equal(esMismoFolioSalper('FR-0200', c), false)
  assert.equal(esMismoFolioSalper('IND-020', c), false)
  assert.deepEqual(variantesFolioSalper(null), [])
})

test('coincideFolioFrisa busca por folio FR y folio externo', () => {
  const o = { order_number: 'FR-025', folio_externo: 'ORD 3310' }
  assert.equal(coincideFolioFrisa(o, 'ord3310'), true)
  assert.equal(coincideFolioFrisa(o, '3310'), true)
  assert.equal(coincideFolioFrisa(o, 'fr025'), true)
  assert.equal(coincideFolioFrisa(o, '9999'), false)
  assert.equal(coincideFolioFrisa({ order_number: 'FR-1' }, ''), true)
})

test('la búsqueda general también encuentra el folio externo de Frisa', () => {
  assert.equal(coincideBusquedaOrden({ order_number: 'FR-025', order_type_key: 'frisa', folio_externo: 'X-77' }, 'x77'), true)
  // las órdenes viejas no Frisa con folio_externo (V32) no cuentan
  assert.equal(coincideBusquedaOrden({ order_number: 'SUB-001', order_type_key: 'sublimacion', folio_externo: 'ORD3148' }, 'ord3148'), false)
})
