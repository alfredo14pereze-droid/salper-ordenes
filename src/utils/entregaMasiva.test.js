// node --test src/utils/entregaMasiva.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { entregarVarias, esBloqueoDeRequisitos, motivoBloqueo, ordenesEntregables } from './entregaMasiva.js'

const orders = [
  { id: 'a', order_number: 'ESC-001', client_name: 'Colegio Uno', status: 'terminado' },
  { id: 'b', order_number: 'ESC-002', client_name: 'Colegio Dos', status: 'cortado' },
  { id: 'c', order_number: 'IND-003', client_name: 'Fábrica', status: 'completado' },
  { id: 'd', order_number: 'SUB-004', client_name: 'Equipo', status: 'terminado', cancelled_at: '2026-10-01' },
  { id: 'e', order_number: 'SUB-005', client_name: 'Los Tigres', status: 'terminado', equipo: 'Tigres' },
]

test('filtra entregables: sin entregadas ni canceladas; solo listas o todas', () => {
  assert.deepEqual(ordenesEntregables(orders).map((o) => o.id), ['a', 'e'])
  assert.deepEqual(ordenesEntregables(orders, { soloListas: false }).map((o) => o.id), ['a', 'b', 'e'])
})

test('búsqueda por folio, cliente o equipo', () => {
  assert.deepEqual(ordenesEntregables(orders, { soloListas: false, busqueda: 'esc-002' }).map((o) => o.id), ['b'])
  assert.deepEqual(ordenesEntregables(orders, { busqueda: 'tigres' }).map((o) => o.id), ['e'])
})

test('entrega varias, separa bloqueadas por requisitos y otros errores, sin detenerse', async () => {
  const llamadas = []
  const entregar = async (id, opts) => {
    llamadas.push([id, opts.forzar])
    if (id === 'b') return { error: new Error('No se puede marcar como entregada. Falta precio en: Playera M.') }
    if (id === 'c') return { error: new Error('Esta orden ya está entregada.') }
    if (id === 'x') throw new Error('sin red')
    return { error: null }
  }
  const avance = []
  const r = await entregarVarias(['a', 'b', 'c', 'x', 'e'], entregar, { onProgreso: (n, t) => avance.push(`${n}/${t}`) })
  assert.deepEqual(r.entregadas, ['a', 'e'])
  assert.deepEqual(r.bloqueadas.map((b) => b.id), ['b'])
  assert.deepEqual(r.errores.map((b) => b.id), ['c', 'x'])
  assert.equal(llamadas.length, 5)
  assert.deepEqual(avance, ['1/5', '2/5', '3/5', '4/5', '5/5'])
})

test('forzar pasa forzar y motivo a cada orden', async () => {
  const vistos = []
  await entregarVarias(['b'], async (id, opts) => { vistos.push(opts); return { error: null } }, { forzar: true, motivo: 'Entregadas en septiembre' })
  assert.deepEqual(vistos, [{ forzar: true, motivo: 'Entregadas en septiembre' }])
})

test('textos de bloqueo', () => {
  assert.equal(esBloqueoDeRequisitos('No se puede marcar como entregada. Falta precio en: X.'), true)
  assert.equal(esBloqueoDeRequisitos('Esta orden está cancelada.'), false)
  assert.equal(motivoBloqueo('No se puede marcar como entregada. Falta precio en: X.'), 'Falta precio en: X.')
})
