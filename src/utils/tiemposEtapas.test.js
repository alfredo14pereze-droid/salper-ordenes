// node --test src/utils/tiemposEtapas.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { medirEtapa, resumenPorEtapa, resumenPorOperario, rangoPeriodo, limitesPeriodo, hoyTorreon, aCsv } from './tiemposEtapas.js'

const t = (fecha, hora) => `${fecha}T${hora}:00-06:00` // 2026-10-05 es lunes

test('medirEtapa', () => {
  assert.deepEqual(medirEtapa({ iniciado_en: t('2026-10-05', '09:00'), completado_en: t('2026-10-05', '10:30') }), { minutos: 90, motivo: null })
  assert.equal(medirEtapa({ iniciado_en: null, completado_en: t('2026-10-05', '10:30') }).motivo, 'sin_inicio')
  assert.equal(medirEtapa({ iniciado_en: '2026-10-05T15:00:00Z', completado_en: '2026-10-05T15:00:40Z' }).motivo, 'de_corrido')
  assert.equal(medirEtapa({ iniciado_en: t('2026-10-10', '09:00'), completado_en: t('2026-10-10', '12:00') }).motivo, 'fuera_horario')
})

test('resúmenes', () => {
  const filas = [
    { etapa: 'corte', operarioId: 'a', minutos: 60, piezas: 10 },
    { etapa: 'corte', operarioId: 'a', minutos: 120, piezas: 50 },
    { etapa: 'corte', operarioId: 'b', minutos: null, piezas: 5 },
    { etapa: 'bordado', operarioId: 'b', minutos: 30, piezas: 0 },
  ]
  const [bordado, corte] = resumenPorEtapa(filas, ['bordado', 'corte'])
  assert.equal(bordado.clave, 'bordado')
  assert.equal(bordado.minutosPorPieza, null)
  assert.deepEqual(
    { ...corte },
    { clave: 'corte', terminadas: 3, medidas: 2, sinMedir: 1, promedio: 90, mediana: 90, minimo: 60, maximo: 120, minutosPorPieza: 3 },
  )
  const ops = resumenPorOperario(filas)
  assert.equal(ops.length, 2)
  assert.equal(ops.find((o) => o.clave === 'b').medidas, 1)
})

test('periodos', () => {
  // miércoles 7 de octubre de 2026
  assert.deepEqual(rangoPeriodo('semana', '2026-10-07'), { desde: '2026-10-05', hasta: '2026-10-11' })
  assert.deepEqual(rangoPeriodo('semana_pasada', '2026-10-07'), { desde: '2026-09-28', hasta: '2026-10-04' })
  assert.deepEqual(rangoPeriodo('semana', '2026-10-11'), { desde: '2026-10-05', hasta: '2026-10-11' }) // domingo
  assert.deepEqual(rangoPeriodo('mes', '2026-10-07'), { desde: '2026-10-01', hasta: '2026-10-31' })
  assert.deepEqual(rangoPeriodo('mes_pasado', '2026-01-15'), { desde: '2025-12-01', hasta: '2025-12-31' })
  assert.deepEqual(limitesPeriodo({ desde: '2026-10-05', hasta: '2026-10-11' }), {
    desdeIso: '2026-10-05T00:00:00-06:00',
    hastaIso: '2026-10-12T00:00:00-06:00',
  })
  // 03:00Z del día 8 todavía es día 7 en Torreón
  assert.equal(hoyTorreon(new Date('2026-10-08T03:00:00Z')), '2026-10-07')
})

test('csv', () => {
  assert.equal(aCsv(['a', 'b'], [['x, y', 'di "hola"'], [1, null]]), 'a,b\r\n"x, y","di ""hola"""\r\n1,')
})
