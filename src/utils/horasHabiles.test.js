// node --test src/utils/horasHabiles.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularHorasHabiles, formatMinutosHabiles } from './horasHabiles.js'

// Hora de Torreón (UTC-6). 2026-10-05 es lunes.
const t = (fecha, hora) => `${fecha}T${hora}:00-06:00`
const min = (a, b) => calcularHorasHabiles(a, b)

test('mismo día, dentro de la jornada', () => {
  assert.equal(min(t('2026-10-05', '09:00'), t('2026-10-05', '11:30')), 150)
})

test('lunes 5pm a martes 9am = 2 h', () => {
  assert.equal(min(t('2026-10-05', '17:00'), t('2026-10-06', '09:00')), 120)
})

test('fuera de horario no cuenta', () => {
  assert.equal(min(t('2026-10-05', '06:00'), t('2026-10-05', '07:59')), 0)
  assert.equal(min(t('2026-10-05', '18:00'), t('2026-10-05', '23:00')), 0)
  assert.equal(min(t('2026-10-05', '17:30'), t('2026-10-05', '19:00')), 30)
  assert.equal(min(t('2026-10-05', '07:00'), t('2026-10-05', '08:45')), 45)
})

test('el fin de semana no cuenta', () => {
  assert.equal(min(t('2026-10-10', '09:00'), t('2026-10-11', '17:00')), 0)
  // viernes 4pm a lunes 10am = 2 h + 2 h
  assert.equal(min(t('2026-10-09', '16:00'), t('2026-10-12', '10:00')), 240)
  // termina en sábado: solo cuenta lo del viernes
  assert.equal(min(t('2026-10-09', '17:00'), t('2026-10-10', '12:00')), 60)
})

test('cruza toda la semana', () => {
  // lunes 8am a lunes siguiente 8am = 5 jornadas de 10 h
  assert.equal(min(t('2026-10-05', '08:00'), t('2026-10-12', '08:00')), 5 * 600)
  // miércoles 3pm a martes siguiente 10am = 3 h + jue + vie + lun + 2 h
  assert.equal(min(t('2026-10-07', '15:00'), t('2026-10-13', '10:00')), 180 + 3 * 600 + 120)
})

test('usa la hora de Torreón aunque el dato venga en UTC', () => {
  // 15:00Z = 9:00 en Torreón; 01:00Z del día siguiente = 19:00
  assert.equal(min('2026-10-05T15:00:00Z', '2026-10-06T01:00:00Z'), 540)
  assert.equal(min(new Date('2026-10-05T14:00:00Z'), new Date('2026-10-05T15:00:00Z')), 60)
})

test('datos vacíos o al revés dan 0', () => {
  assert.equal(min(null, t('2026-10-05', '09:00')), 0)
  assert.equal(min(t('2026-10-05', '09:00'), null), 0)
  assert.equal(min('no es fecha', t('2026-10-05', '09:00')), 0)
  assert.equal(min(t('2026-10-05', '11:00'), t('2026-10-05', '09:00')), 0)
})

test('formato', () => {
  assert.equal(formatMinutosHabiles(45), '45 min')
  assert.equal(formatMinutosHabiles(120), '2 h')
  assert.equal(formatMinutosHabiles(135), '2 h 15 min')
  assert.equal(formatMinutosHabiles(600), '10 h')
  assert.equal(formatMinutosHabiles(1530), '25 h 30 min')
  assert.equal(formatMinutosHabiles(null), '—')
})
