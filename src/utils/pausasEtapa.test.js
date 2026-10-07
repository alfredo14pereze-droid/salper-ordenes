// node --test src/utils/pausasEtapa.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { estaPausada, soportaPausa, tramosEnPausa, msTrabajados, minutosHabilesTrabajados } from './pausasEtapa.js'
import { medirEtapa } from './tiemposEtapas.js'
import { situacionEnEstacion } from './ordenesDeEstacion.js'

const t = (fecha, hora) => `${fecha}T${hora}:00-06:00` // 2026-10-05 es lunes
const MIN = 60000

test('sin columnas de pausa (SQL sin aplicar) todo sigue igual', () => {
  const et = { estado: 'en_proceso', iniciado_en: t('2026-10-05', '09:00') }
  assert.equal(soportaPausa(et), false)
  assert.equal(estaPausada(et), false)
  assert.equal(msTrabajados(et, t('2026-10-05', '10:00')), 60 * MIN)
  assert.equal(minutosHabilesTrabajados(et, t('2026-10-05', '10:00')), 60)
})

test('pausa abierta: el reloj se queda en el momento de la pausa', () => {
  const et = { estado: 'en_proceso', iniciado_en: t('2026-10-05', '09:00'), pausada_en: t('2026-10-05', '09:40'), pausas: [], tiempo_pausado_ms: 0 }
  assert.equal(soportaPausa(et), true)
  assert.equal(estaPausada(et), true)
  assert.equal(msTrabajados(et, t('2026-10-05', '10:00')), 40 * MIN)
  assert.equal(msTrabajados(et, t('2026-10-05', '15:00')), 40 * MIN)
  assert.equal(minutosHabilesTrabajados(et, t('2026-10-05', '15:00')), 40)
})

test('varias pausas: al reanudar sigue desde donde iba', () => {
  const et = {
    estado: 'en_proceso',
    iniciado_en: t('2026-10-05', '09:00'),
    pausada_en: null,
    pausas: [
      { inicio: t('2026-10-05', '09:30'), fin: t('2026-10-05', '10:00') },
      { inicio: t('2026-10-05', '11:00'), fin: t('2026-10-05', '11:15') },
    ],
  }
  assert.equal(estaPausada(et), false)
  assert.equal(msTrabajados(et, t('2026-10-05', '12:00')), (180 - 45) * MIN)
  assert.equal(minutosHabilesTrabajados(et, t('2026-10-05', '12:00')), 135)
})

test('una pausa de toda la noche no descuenta tiempo hábil de más', () => {
  const et = {
    estado: 'completado',
    iniciado_en: t('2026-10-05', '16:00'),
    completado_en: t('2026-10-06', '10:00'),
    pausas: [{ inicio: t('2026-10-05', '17:00'), fin: t('2026-10-06', '09:00') }],
  }
  // Hábiles de corrido: 2 h del lunes + 2 h del martes. La pausa se lleva 1 h de cada día.
  assert.deepEqual(medirEtapa(et), { minutos: 120, motivo: null })
})

test('las pausas se recortan a la vida de la etapa y una etapa toda en pausa no se promedia', () => {
  const et = {
    estado: 'completado',
    iniciado_en: t('2026-10-05', '09:00'),
    completado_en: t('2026-10-05', '10:00'),
    pausas: [{ inicio: t('2026-10-05', '08:00'), fin: t('2026-10-05', '11:00') }],
  }
  assert.deepEqual(tramosEnPausa(et), [[new Date(et.iniciado_en).getTime(), new Date(et.completado_en).getTime()]])
  assert.equal(medirEtapa(et).motivo, 'en_pausa')
})

test('qué órdenes le salen a cada estación', () => {
  const orden = (estados) => Object.entries(estados).map(([etapa, estado]) => ({ etapa, estado }))
  const escolar = (corte, produccion, bordado, terminado) => orden({ corte, produccion, bordado, terminado })

  // Costura y bordado esperan a corte; salen las dos a la vez cuando termina.
  assert.equal(situacionEnEstacion('produccion', escolar('pendiente', 'pendiente', 'pendiente', 'pendiente')), 'espera')
  assert.equal(situacionEnEstacion('bordado', escolar('en_proceso', 'pendiente', 'pendiente', 'pendiente')), 'espera')
  assert.equal(situacionEnEstacion('produccion', escolar('completado', 'pendiente', 'pendiente', 'pendiente')), 'lista')
  assert.equal(situacionEnEstacion('bordado', escolar('completado', 'en_proceso', 'pendiente', 'pendiente')), 'lista')
  // Corte no cambia.
  assert.equal(situacionEnEstacion('corte', escolar('pendiente', 'pendiente', 'pendiente', 'pendiente')), 'lista')

  // Terminado entra en cuanto costura O bordado empiezan, aunque no hayan acabado.
  assert.equal(situacionEnEstacion('terminado', escolar('completado', 'pendiente', 'pendiente', 'pendiente')), 'espera')
  assert.equal(situacionEnEstacion('terminado', escolar('completado', 'en_proceso', 'pendiente', 'pendiente')), 'lista')
  assert.equal(situacionEnEstacion('terminado', escolar('completado', 'pendiente', 'completado', 'pendiente')), 'lista')

  // Lo ya empezado no se esconde; lo terminado ya no sale.
  assert.equal(situacionEnEstacion('bordado', escolar('pendiente', 'pendiente', 'en_proceso', 'pendiente')), 'lista')
  assert.equal(situacionEnEstacion('bordado', escolar('completado', 'pendiente', 'completado', 'pendiente')), null)
  assert.equal(situacionEnEstacion('bordado', orden({ corte: 'completado', produccion: 'pendiente' })), null)

  // Orden de tipo "bordado" (sin corte) y orden que solo lleva terminado.
  assert.equal(situacionEnEstacion('bordado', orden({ bordado: 'pendiente', terminado: 'pendiente' })), 'lista')
  assert.equal(situacionEnEstacion('terminado', orden({ bordado: 'pendiente', terminado: 'pendiente' })), 'espera')
  assert.equal(situacionEnEstacion('terminado', orden({ terminado: 'pendiente' })), 'lista')
  assert.equal(situacionEnEstacion('impresion_prenda', orden({ corte: 'pendiente', impresion_prenda: 'pendiente' })), 'lista')
})
