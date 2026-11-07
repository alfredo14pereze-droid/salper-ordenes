import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularUrgente } from './frisaSurtido.js'
import { reportePorSurtir } from './frisaReportes.js'

test('reporte por surtir: pide, hay, falta producir y totales', () => {
  const inv = [{ id: 'a', clave: 'A', nombre: 'PLAYERA A', disponible: 10, articulo: '1' }, { id: 'b', clave: 'B', nombre: 'PANTALON', disponible: 50 }]
  const u = calcularUrgente(inv, [
    { id: 'x', numero_oc: '1', estado: 'pendiente', fecha_limite: '2026-11-10' },
    { id: 'y', numero_oc: '2', estado: 'pendiente', fecha_limite: '2026-11-12' },
  ], [
    { surtido_id: 'x', producto_id: 'a', clave: 'A', cantidad: 6 }, { surtido_id: 'x', producto_id: 'b', clave: 'B', cantidad: 5 },
    { surtido_id: 'y', producto_id: 'a', clave: 'A', cantidad: 9 },
  ])
  const r = reportePorSurtir(u)
  assert.deepEqual(r.filas[0], ['A', '1', 'PLAYERA A', 2, 15, 10, 5])
  assert.deepEqual(r.filas.at(-1), ['TOTAL', '', '2 claves', 2, 20, 60, 5])
  assert.equal(r.totales['Se pueden surtir'], 1)
  assert.equal(r.totales['Cubiertas con lo que hay'], 15)
})
