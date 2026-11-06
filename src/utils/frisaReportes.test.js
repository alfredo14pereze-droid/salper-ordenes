import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reporteCSV, reporteSurtidos, nombreArchivo, reporteInventario } from './frisaReportes.js'

test('CSV con comillas y BOM', () => {
  const csv = reporteCSV({ titulo: 'X', columnas: [{ titulo: 'Clave' }, { titulo: 'Nombre' }], filas: [['A', 'Playera, M/C']] })
  assert.ok(csv.startsWith('﻿Clave,Nombre\r\n'))
  assert.match(csv, /"Playera, M\/C"/)
})

test('surtidos filtrados por fecha y estado, un renglón por clave', () => {
  const surtidos = [
    { id: 's1', numero_oc: '1', planta: 'P', estado: 'entregada', creado_en: '2026-11-03T10:00:00Z' },
    { id: 's2', numero_oc: '2', planta: 'P', estado: 'pendiente', creado_en: '2026-11-05T10:00:00Z' },
    { id: 's3', numero_oc: '3', planta: 'P', estado: 'entregada', creado_en: '2026-10-01T10:00:00Z' },
  ]
  const lineas = [{ surtido_id: 's1', producto_id: 'a', clave: 'A', cantidad: 5 }, { surtido_id: 's1', producto_id: 'b', clave: 'B', cantidad: 3 }, { surtido_id: 's2', producto_id: 'a', clave: 'A', cantidad: 1 }]
  const r = reporteSurtidos(surtidos, lineas, { desde: '2026-11-01', hasta: '2026-11-06', estado: 'entregada' })
  assert.equal(r.filas.length, 2)
  assert.deepEqual(r.totales, { Órdenes: 1, Piezas: 8 })
})

test('inventario ordenado por clave y nombre de archivo', () => {
  const r = reporteInventario([
    { clave: 'B', nombre: 'b', real: 5, apartado: 1, disponible: 4, niveles: { minimo: 1, reorden: 2, maximo: 3, estado: 'ok', aPedir: null } },
    { clave: 'A', nombre: 'a', real: 0, apartado: 0, disponible: 0, niveles: { minimo: 1, reorden: 2, maximo: 3, estado: 'critico', aPedir: 3 } },
  ])
  assert.deepEqual(r.filas.map((f) => f[0]), ['A', 'B'])
  assert.match(nombreArchivo(r, 'csv'), /^SALPER-Frisa-Inventario-de-la-fabrica-\d{4}-\d{2}-\d{2}\.csv$/)
})
