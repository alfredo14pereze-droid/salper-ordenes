// node --test src/utils/ordenesDeEstacion.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { situacionEnEstacion } from './ordenesDeEstacion.js'

const etapas = (estados) => Object.entries(estados).map(([etapa, estado], i) => ({ etapa, estado, orden_secuencia: i + 1 }))

test('V215: orden entregada con costura pendiente no le sale a costura (VEN-005, ESC-035, ESC-052)', () => {
  const et = etapas({ corte: 'completado', produccion: 'pendiente', bordado: 'completado', terminado: 'completado' })
  assert.equal(situacionEnEstacion('produccion', et, { status: 'completado', order_type_key: 'escolar' }), null)
  // Aunque no se pase la orden: terminado completado basta.
  assert.equal(situacionEnEstacion('produccion', et), null)
})

test('V215: orden lista para entregar no le sale a nadie, ni lo que estaba en proceso', () => {
  const et = etapas({ sublimado: 'pendiente', corte: 'completado', produccion: 'en_proceso', terminado: 'pendiente' })
  const orden = { status: 'terminado', order_type_key: 'sublimacion' }
  for (const etapa of ['sublimado', 'produccion', 'terminado']) assert.equal(situacionEnEstacion(etapa, et, orden), null)
})

test('V215: entregada con etapa en proceso tampoco sale', () => {
  const et = etapas({ corte: 'completado', produccion: 'en_proceso', terminado: 'en_proceso' })
  assert.equal(situacionEnEstacion('produccion', et, { status: 'completado' }), null)
  assert.equal(situacionEnEstacion('terminado', et, { status: 'completado' }), null)
})

test('V215: terminado completado con bordado pendiente → null para bordado', () => {
  const et = etapas({ corte: 'completado', bordado: 'pendiente', terminado: 'completado' })
  assert.equal(situacionEnEstacion('bordado', et, { status: 'en_produccion' }), null)
})

test('sin cambios: orden en producción sigue saliendo como antes (V140)', () => {
  const orden = { status: 'en_produccion', order_type_key: 'sublimacion' }
  // SUB-058: costura en proceso → lista
  const sub058 = etapas({ impresion: 'completado', sublimado: 'completado', corte: 'completado', produccion: 'en_proceso', terminado: 'pendiente' })
  assert.equal(situacionEnEstacion('produccion', sub058, orden), 'lista')
  assert.equal(situacionEnEstacion('terminado', sub058, orden), 'lista')
  const sinCorte = etapas({ corte: 'en_proceso', produccion: 'pendiente', terminado: 'pendiente' })
  assert.equal(situacionEnEstacion('produccion', sinCorte, orden), 'espera')
  assert.equal(situacionEnEstacion('terminado', sinCorte, orden), 'espera')
  // terminado en proceso en una orden no terminada sigue saliéndole a terminado
  assert.equal(situacionEnEstacion('terminado', etapas({ produccion: 'completado', terminado: 'en_proceso' }), orden), 'lista')
})

test('sin cambios: Frisa sigue con su secuencia estricta (V155)', () => {
  const frisa = { order_type_key: 'frisa', status: 'en_produccion' }
  const et = etapas({ descosido: 'completado', reflejante: 'pendiente', impresion_prenda: 'pendiente', terminado: 'pendiente' })
  assert.equal(situacionEnEstacion('reflejante', et, frisa), 'lista')
  assert.equal(situacionEnEstacion('impresion_prenda', et, frisa), 'espera')
  assert.equal(situacionEnEstacion('reflejante', et, { ...frisa, status: 'completado' }), null)
})

// V220 — orden de tipo Impresión: impresión (la hace terminado) → terminado.
test('tipo impresión: impresión le toca de inmediato; terminado espera a que empiece la impresión', () => {
  const orden = { order_type_key: 'impresion', status: 'confirmada' }
  const etapas = [
    { etapa: 'impresion_prenda', estado: 'pendiente', orden_secuencia: 1 },
    { etapa: 'terminado', estado: 'pendiente', orden_secuencia: 2 },
  ]
  assert.equal(situacionEnEstacion('impresion_prenda', etapas, orden), 'lista')
  assert.equal(situacionEnEstacion('terminado', etapas, orden), 'espera')
  etapas[0].estado = 'en_proceso'
  assert.equal(situacionEnEstacion('terminado', etapas, orden), 'lista')
})
