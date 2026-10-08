// node --test src/utils/impresionReporte.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { formatMl, numero, reporteDeEtapa, totalTinta, validarReporteImpresion } from './impresionReporte.js'

test('el total suma los cuatro colores (el ejemplo del programa de impresión)', () => {
  assert.equal(totalTinta({ azul: '2.653', magenta: '1.166', amarillo: '0.368', negro: '1.839' }), 6.026)
  assert.equal(formatMl(6.026), '6.026 mL')
  assert.equal(totalTinta({ azul: '0.1', magenta: '0.2' }), 0.3)
  assert.equal(totalTinta({}), 0)
})

test('acepta coma decimal y rechaza texto', () => {
  assert.equal(numero('2,653'), 2.653)
  assert.equal(numero(' 12 '), 12)
  assert.equal(numero('.5'), 0.5)
  assert.equal(numero(''), null)
  assert.equal(numero('abc'), null)
  assert.equal(numero('-1'), null)
})

test('validación: largo mayor a cero y los cuatro colores (0 se vale)', () => {
  const ok = { largo: '3.2', azul: '2.653', magenta: '1.166', amarillo: '0', negro: '1.839' }
  assert.equal(validarReporteImpresion(ok), null)
  assert.match(validarReporteImpresion({ ...ok, largo: '' }), /largo/)
  assert.match(validarReporteImpresion({ ...ok, largo: '0' }), /largo/)
  assert.match(validarReporteImpresion({ ...ok, amarillo: '' }), /amarillo/)
})

test('lee el reporte guardado en la etapa', () => {
  assert.equal(reporteDeEtapa({ estado: 'completado' }), null)
  assert.deepEqual(
    reporteDeEtapa({ imp_largo_m: '3.200', imp_tinta_azul_ml: '2.653', imp_tinta_magenta_ml: '1.166', imp_tinta_amarillo_ml: '0.368', imp_tinta_negro_ml: '1.839', imp_tinta_total_ml: '6.026' }),
    { largo: 3.2, azul: 2.653, magenta: 1.166, amarillo: 0.368, negro: 1.839, total: 6.026 }
  )
})
