// node --test src/utils/cotizarHoja.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { esCotizacionDeHoja, folioValido, ligarHoja, operacionesQueCuentan, prendaPrincipal, resumenHoja } from './cotizarHoja.js'
import { cotizar } from '../components/cotizador/calculos.js'

const catalogo = [
  { folio: 101, prenda: 'CAMISA', parte: 'PUÑO', operacion: 'CERRAR PUÑO PAR', segundos: 30, activa: true },
  { folio: 102, prenda: 'CAMISA', parte: 'PUÑO', operacion: 'VOLTEAR PUÑO PAR', segundos: 25, activa: true },
  { folio: 103, prenda: 'CAMISA', parte: 'PUÑO', operacion: 'HACER OJAL', segundos: 30, activa: false },
  { folio: 2002, prenda: 'PANTALON', parte: 'ENSAMBLE', operacion: 'PRETINA', segundos: 10, activa: true },
]

test('folio válido', () => {
  assert.equal(folioValido('101'), 101)
  assert.equal(folioValido(' 7 '), 7)
  assert.equal(folioValido(''), null)
  assert.equal(folioValido('10a'), null)
  assert.equal(folioValido(1.5), null)
  assert.equal(folioValido(null), null)
})

test('liga cada renglón por folio con su estado', () => {
  const r = ligarHoja(
    [
      { folio: 101, operacion: 'CERRAR PUÑO PAR', segundos: 30 },
      { folio: 102, operacion: 'VOLTEAR', segundos: 40 }, // otros segundos
      { folio: 103, operacion: 'OJAL', segundos: 30 }, // inactiva
      { folio: 999, operacion: 'NO EXISTE', segundos: 10 },
      { folio: null, operacion: 'SIN FOLIO', segundos: 10 },
      { folio: 101, operacion: 'REPETIDA', segundos: 30 },
      { folio: '2002', operacion: 'PRETINA' }, // sin segundos en la hoja = ok
    ],
    catalogo,
  )
  assert.deepEqual(r.map((x) => x.estado), ['ok', 'segundos', 'inactiva', 'no_encontrado', 'sin_folio', 'repetido', 'ok'])
  assert.deepEqual(resumenHoja(r), { total: 7, cuentan: 4, ok: 2, segundos: 1, inactiva: 1, noCuentan: 3 })
  assert.deepEqual(operacionesQueCuentan(r).map((o) => o.folio), [101, 102, 103, 2002])
})

test('el costo usa los segundos del catálogo, no los de la hoja', () => {
  const r = ligarHoja([{ folio: 101, segundos: 30 }, { folio: 102, segundos: 40 }], catalogo)
  const c = cotizar(operacionesQueCuentan(r), '100', '2')
  assert.equal(c.totales.segundosPorPieza, 55) // 30 + 25, no 30 + 40
  assert.ok(Math.abs(c.totales.costoUnitario - 1.375) < 1e-9)
  assert.ok(Math.abs(c.totales.costoTotalLote - 137.5) < 1e-9)
})

test('hoja vacía no truena', () => {
  assert.deepEqual(ligarHoja([], catalogo), [])
  assert.deepEqual(ligarHoja(null, null), [])
  assert.equal(resumenHoja([]).cuentan, 0)
})

test('prenda principal: la de más operaciones; empate, la del folio más chico', () => {
  assert.equal(prendaPrincipal([catalogo[0], catalogo[1], catalogo[3]]), 'CAMISA')
  assert.equal(prendaPrincipal([catalogo[3], catalogo[0]]), 'CAMISA')
  assert.equal(prendaPrincipal([]), null)
})

test('detecta cotización guardada desde hoja', () => {
  assert.equal(esCotizacionDeHoja({ operaciones: [{ folio: 1, prenda: 'X' }] }), true)
  assert.equal(esCotizacionDeHoja({ operaciones: [{ folio: 1 }] }), false)
  assert.equal(esCotizacionDeHoja({ operaciones: [] }), false)
})
