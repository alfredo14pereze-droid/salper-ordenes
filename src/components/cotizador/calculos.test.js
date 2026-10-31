// node --test src/components/cotizador/calculos.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorParte, cotizar, validarOperadoras, validarPiezas, cotizarGuardada, foliosVigentes } from './calculos.js'

const cerca = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`)
const ops = [
  { folio: 2029, parte: 'ENSAMBLE', operacion: 'BASTILLAR', segundos: 80 },
  { folio: 2002, parte: 'PARTES CHICAS', operacion: 'FUSIONAR PRETINA', segundos: 10 },
  { folio: 2027, parte: 'ENSAMBLE', operacion: 'CERRAR COSTADOS', segundos: 40 },
  { folio: 2010, parte: 'MANTA', operacion: 'REFUERZO', segundos: 30 },
]

test('agrupa por parte en orden de folio', () => {
  const g = agruparPorParte(ops)
  assert.deepEqual(g.map((x) => x.parte), ['PARTES CHICAS', 'MANTA', 'ENSAMBLE'])
  assert.deepEqual(g[2].operaciones.map((o) => o.folio), [2027, 2029])
})

test('fórmulas del prompt', () => {
  // 160 seg/pieza, 1000 piezas, 5 operadoras
  const r = cotizar(ops, 1000, 5)
  const t = r.totales
  assert.equal(t.segundosPorPieza, 160)
  cerca(t.costoUnitario, 4) // 160 × 0.025
  cerca(t.costoTotalLote, 4000)
  cerca(t.minutosPorPieza, 160 / 60)
  cerca(t.tiempoTotalMin, (160 / 60) * 1000)
  cerca(t.diasProduccion, ((160 / 60) * 1000) / (5 * 425))
  assert.equal(t.diasEnteros, 2) // 1.2549… → 2
  const f = r.filas.find((x) => x.folio === 2029)
  cerca(f.precio, 2) // 80 × 0.025
  cerca(f.costoLote, 2000)
  assert.deepEqual(r.filas.map((x) => x.folio), [2002, 2010, 2027, 2029])
})

test('días exactos no suben por error de punto flotante', () => {
  // 425 min por pieza × 3 piezas / (1 × 425) = 3 días exactos
  const r = cotizar([{ folio: 1, parte: 'P', operacion: 'X', segundos: 425 * 60 }], 3, 1)
  cerca(r.totales.diasProduccion, 3)
  assert.equal(r.totales.diasEnteros, 3)
})

test('sin operaciones seleccionadas: todo en cero', () => {
  const r = cotizar([], 500, 10)
  assert.deepEqual(r.filas, [])
  for (const k of ['segundosPorPieza', 'costoUnitario', 'costoTotalLote', 'minutosPorPieza', 'tiempoTotalMin', 'diasProduccion', 'diasEnteros']) assert.equal(r.totales[k], 0)
  assert.equal(r.totales.operadoras, 10)
})

test('tiempo 0, vacío o inválido se marca con aviso y vale 0', () => {
  const r = cotizar([{ folio: 1, parte: 'P', operacion: 'A', segundos: 0 }, { folio: 2, parte: 'P', operacion: 'B', segundos: null }, { folio: 3, parte: 'P', operacion: 'C', segundos: 20 }], 10, 1)
  assert.equal(r.conAviso, 2)
  assert.deepEqual(r.filas.map((f) => f.aviso), [true, true, false])
  assert.equal(r.totales.segundosPorPieza, 20)
})

test('piezas u operadoras inválidas no truenan ni dividen entre 0', () => {
  const r = cotizar(ops, '', 0)
  assert.equal(r.totales.costoTotalLote, 0)
  assert.equal(r.totales.diasProduccion, 0)
  assert.equal(r.totales.segundosPorPieza, 160) // por pieza sí se calcula
})

test('validaciones', () => {
  assert.equal(validarPiezas('10'), null)
  assert.ok(validarPiezas('0'))
  assert.ok(validarPiezas('2.5'))
  assert.ok(validarPiezas(''))
  assert.equal(validarOperadoras('1'), null)
  assert.equal(validarOperadoras('60'), null)
  assert.ok(validarOperadoras('61'))
  assert.ok(validarOperadoras('0'))
  assert.ok(validarOperadoras('1.5'))
})

test('cotización guardada se recalcula con sus propios números', () => {
  const c = {
    prenda: 'CAMISA', piezas: 100, operadoras: 2, costo_por_segundo: '0.05', minutos_dia: '100',
    operaciones: [{ folio: 2, parte: 'P', operacion: 'B', segundos: '30' }, { folio: 1, parte: 'P', operacion: 'A', segundos: '30' }],
  }
  const r = cotizarGuardada(c)
  assert.equal(r.totales.segundosPorPieza, 60)
  assert.equal(r.totales.costoUnitario, 3)
  assert.equal(r.totales.costoTotalLote, 300)
  assert.equal(r.totales.diasProduccion, 0.5) // 100 min / (2 × 100)
  assert.deepEqual(r.filas.map((f) => f.folio), [1, 2])
})

test('volver a cotizar: solo los folios que siguen activos en esa prenda', () => {
  const c = { prenda: 'CAMISA', operaciones: [{ folio: 1 }, { folio: 2 }, { folio: 3 }] }
  const activas = [{ folio: 1, prenda: 'CAMISA' }, { folio: 3, prenda: 'PANTALON' }]
  assert.deepEqual(foliosVigentes(c, activas), { vigentes: [1], faltan: 2 })
})
