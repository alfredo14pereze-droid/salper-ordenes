// node --test src/utils/flujoSublimado.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { badgesSublimado, bandejasSublimado, pasoSublimado } from './flujoSublimado.js'

const et = (imp, sub, extra = {}) => [
  ...(imp ? [{ etapa: 'impresion', estado: imp }] : []),
  ...(sub ? [{ etapa: 'sublimado', estado: sub, ...extra }] : []),
  { etapa: 'corte', estado: 'pendiente' },
]

test('paso en secuencia', () => {
  assert.equal(pasoSublimado({}, et('pendiente', 'pendiente')), 'diseno')
  assert.equal(pasoSublimado({ diseno_autorizado_en: 'x' }, et('pendiente', 'pendiente')), 'imprimir')
  assert.equal(pasoSublimado({}, et('en_proceso', 'pendiente')), 'imprimir')
  assert.equal(pasoSublimado({ diseno_autorizado_en: 'x' }, et('completado', 'pendiente')), 'sublimar')
  assert.equal(pasoSublimado({ diseno_autorizado_en: 'x' }, et('completado', 'en_proceso')), 'sublimar')
  assert.equal(pasoSublimado({ diseno_autorizado_en: 'x' }, et('completado', 'completado')), 'hecha')
  assert.equal(pasoSublimado({}, et('pendiente', 'completado')), 'hecha')
  assert.equal(pasoSublimado({}, et('completado', null)), 'hecha')
})

test('badges verdes al cumplirse cada paso', () => {
  const b = badgesSublimado({ diseno_autorizado_en: 'x' }, et('completado', 'pendiente'))
  assert.deepEqual(b.map((x) => [x.label, x.estado]), [['Diseño autorizado', 'completado'], ['Impreso', 'completado'], ['Por sublimar', 'pendiente']])
  const c = badgesSublimado({}, et('pendiente', 'pendiente'))
  assert.equal(c[0].label, 'Diseño por autorizar')
  assert.equal(c[0].estado, 'pendiente')
})

test('bandejas', () => {
  const orders = [
    { id: 1, order_type_key: 'sublimacion', status: 'confirmado' },
    { id: 2, order_type_key: 'sublimacion', status: 'confirmado', diseno_autorizado_en: 'x' },
    { id: 3, order_type_key: 'sublimacion', status: 'impreso', diseno_autorizado_en: 'x' },
    { id: 4, order_type_key: 'sublimacion', status: 'sublimado', diseno_autorizado_en: 'x' },
    { id: 5, order_type_key: 'sublimacion', status: 'completado', diseno_autorizado_en: 'x' },
    { id: 6, order_type_key: 'sublimacion', status: 'confirmado', cancelled_at: 'x' },
    { id: 7, order_type_key: 'escolar', status: 'confirmado' },
    { id: 8, order_type_key: 'sublimacion', status: 'en_produccion', diseno_autorizado_en: 'x' },
  ]
  const e = {
    1: et('pendiente', 'pendiente'),
    2: et('pendiente', 'pendiente'),
    3: et('completado', 'pendiente'),
    4: et('completado', 'completado', { completado_en: '2026-10-20' }),
    5: et('completado', 'completado', { completado_en: '2026-10-01' }),
    6: et('pendiente', 'pendiente'),
    8: et('completado', 'completado', { completado_en: '2026-10-25' }),
  }
  const b = Object.fromEntries(bandejasSublimado(orders, e).map((x) => [x.key, x.ordenes.map((o) => o.id)]))
  assert.deepEqual(b, { diseno: [1], imprimir: [2], sublimar: [3], todas: [8, 4, 5] })
})
