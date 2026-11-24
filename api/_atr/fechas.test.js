import test from 'node:test'
import assert from 'node:assert/strict'
import { fechaAtr, fechasOcAtr } from './fechas.js'

test('mes/día/año como en la OC real C19536', () => {
  assert.equal(fechaAtr('11/10/2026'), '2026-11-10') // 10 de noviembre, no 11 de octubre
  assert.equal(fechaAtr('12/10/2026'), '2026-12-10')
  assert.equal(fechaAtr('1/5/2027'), '2027-01-05')
  assert.equal(fechaAtr('02-28-2027'), '2027-02-28')
  assert.equal(fechaAtr('11.10.26'), '2026-11-10')
})

test('con el mes en letra (inglés o español) y en ISO', () => {
  assert.equal(fechaAtr('Nov 10, 2026'), '2026-11-10')
  assert.equal(fechaAtr('November 10 2026'), '2026-11-10')
  assert.equal(fechaAtr('10 Nov 2026'), '2026-11-10')
  assert.equal(fechaAtr('10 de noviembre de 2026'), '2026-11-10')
  assert.equal(fechaAtr('2026-11-10'), '2026-11-10')
})

test('lo que no es fecha no se inventa', () => {
  assert.equal(fechaAtr(''), null)
  assert.equal(fechaAtr(null), null)
  assert.equal(fechaAtr('25/10/2026'), null) // no hay mes 25
  assert.equal(fechaAtr('02/30/2026'), null) // 30 de febrero
  assert.equal(fechaAtr('C19536'), null)
})

test('entrega desde "Días para entregar" si no se lee', () => {
  assert.deepEqual(fechasOcAtr({ fecha_oc_texto: '11/10/2026', fecha_entrega_texto: '12/10/2026', dias_para_entregar: 30 }),
    { fechaOc: '2026-11-10', fechaEntrega: '2026-12-10' })
  assert.deepEqual(fechasOcAtr({ fecha_oc_texto: '11/10/2026', fecha_entrega_texto: '', dias_para_entregar: 30 }),
    { fechaOc: '2026-11-10', fechaEntrega: '2026-12-10' })
  assert.deepEqual(fechasOcAtr({ fecha_oc_texto: '', fecha_entrega_texto: '', dias_para_entregar: 30 }),
    { fechaOc: null, fechaEntrega: null })
})
