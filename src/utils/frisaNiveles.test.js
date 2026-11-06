import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularNiveles, conNiveles, ordenarPorEstado, resumenNiveles, filtrarNiveles, parseCSV,
  parseNivelesCSV, parseSupuestosCSV, compararConSheet, aPedirCSV, listaAPedir, CONFIG_INICIAL,
} from './frisaNiveles.js'

const cfg = CONFIG_INICIAL

test('niveles redondean hacia arriba (44 en 289 días: 0.152/día × 20 = 3.04 → 4)', () => {
  const n = calcularNiveles({ consumo_2026: 44, stock_actual: 0 }, cfg)
  assert.equal(n.minimo, 4)
  assert.equal(n.reorden, Math.ceil((44 * 28) / 289))
  assert.equal(n.maximo, Math.ceil((44 * 42) / 289))
})

test('múltiplo exacto no sube de más', () => {
  const n = calcularNiveles({ consumo_2026: 289, stock_actual: 0 }, cfg)
  assert.deepEqual([n.minimo, n.reorden, n.maximo], [20, 28, 42])
})

test('estados y A PEDIR', () => {
  const base = { consumo_2026: 289 }
  assert.equal(calcularNiveles({ ...base, stock_actual: 19 }, cfg).estado, 'critico')
  assert.equal(calcularNiveles({ ...base, stock_actual: 19 }, cfg).aPedir, 23)
  // Igual al mínimo / reorden cuenta (≤, como el Sheet).
  assert.equal(calcularNiveles({ ...base, stock_actual: 20 }, cfg).estado, 'critico')
  assert.equal(calcularNiveles({ ...base, stock_actual: 21 }, cfg).estado, 'pedir')
  assert.equal(calcularNiveles({ ...base, stock_actual: 28 }, cfg).estado, 'pedir')
  assert.equal(calcularNiveles({ ...base, stock_actual: 27 }, cfg).aPedir, 15)
  const ok = calcularNiveles({ ...base, stock_actual: 29 }, cfg)
  assert.equal(ok.estado, 'ok')
  assert.equal(ok.aPedir, null)
})

test('sin movimiento: todo 0 y OK', () => {
  const n = calcularNiveles({ consumo_2026: 0, stock_actual: 0 }, cfg)
  assert.deepEqual([n.minimo, n.reorden, n.maximo, n.estado, n.aPedir, n.sinMovimiento], [0, 0, 0, 'ok', null, true])
})

test('orden: CRÍTICO, luego PEDIR, A PEDIR desc', () => {
  const filas = conNiveles([
    { clave: 'A', consumo_2026: 289, stock_actual: 29 },
    { clave: 'B', consumo_2026: 289, stock_actual: 25 },
    { clave: 'C', consumo_2026: 289, stock_actual: 0 },
    { clave: 'D', consumo_2026: 578, stock_actual: 50 },
  ], cfg)
  assert.deepEqual(ordenarPorEstado(filas).map((f) => f.clave), ['C', 'D', 'B', 'A'])
  const r = resumenNiveles(filas)
  assert.deepEqual([r.critico, r.pedir, r.ok, r.piezasAPedir], [1, 2, 1, 42 + 34 + 17])
})

test('filtros', () => {
  const filas = conNiveles([
    { clave: 'CAMFR-1', nombre: 'Camisa mezclilla', tipo: 'Camisa', color: 'Azul', consumo_2026: 289, stock_actual: 0 },
    { clave: 'PLA-1', nombre: 'Playera', tipo: 'Playera', color: 'Gris', consumo_2026: 289, stock_actual: 100 },
    { clave: 'BOL-1', nombre: 'Bolsa', consumo_2026: 0, stock_actual: 0 },
  ], cfg)
  assert.equal(filtrarNiveles(filas, {}).length, 2)
  assert.equal(filtrarNiveles(filas, { mostrarSinMovimiento: true }).length, 3)
  assert.deepEqual(filtrarNiveles(filas, { estado: 'alerta' }).map((f) => f.clave), ['CAMFR-1'])
  assert.deepEqual(filtrarNiveles(filas, { texto: 'mezclílla' }).map((f) => f.clave), ['CAMFR-1'])
  assert.deepEqual(filtrarNiveles(filas, { tipo: 'Playera' }).map((f) => f.clave), ['PLA-1'])
})

test('parseCSV con comillas y comas', () => {
  assert.deepEqual(parseCSV('a,"b, c","d ""x"""\r\n1,2,3'), [['a', 'b, c', 'd "x"'], ['1', '2', '3']])
})

const NIVELES = [
  'CONSUMOS FRISA NIVELES,,,',
  'Instrucciones: captura el stock,,,',
  'Clave,Nombre,Tipo,Reflejante,Manga,Color,2025,2026,Total,Demanda diaria,Clase ABC,Stock actual,Mínimo (crítico),Reorden (pedir),Máximo (6 sem),Estado,A PEDIR,Tendencia,Nota',
  'CAMFR-000L-01MZ1B1I,"CAMISA MEZCLILLA, T-L",Camisa,Sí,ML,Mezclilla,76,44,120,0.15,A,2,4,5,7,🔴 CRÍTICO,5,↓,',
  'BOLFR-0000-01MEZC,BOLSA,,-,,Mezclilla,10,0,10,0,-,3,0,0,0,OK,,,sin ventas',
  'PLA-X,PLAYERA,Playera,No,MC,Gris,"1,200",289,1489,1,A,30,20,28,42,PEDIR,12,↑,',
  ',TOTAL,,,,,"1,286",333,,,,,,,,,17,,',
  ',,,,',
  'LEYENDA DE ESTADO,,,,',
  'CRÍTICO,Stock ≤ mínimo,,,',
].join('\n')

test('parseNivelesCSV y comparación con el Sheet', () => {
  const { productos, sheet, errores } = parseNivelesCSV(NIVELES)
  assert.deepEqual(errores, [])
  assert.equal(productos.length, 3)
  assert.equal(productos[0].nombre, 'CAMISA MEZCLILLA, T-L')
  assert.equal(productos[1].tipo, null)
  assert.equal(productos[1].reflejante, '-')
  assert.equal(productos[1].clase_abc, '-')
  assert.equal(productos[2].consumo_2025, 1200)
  assert.equal(sheet['CAMFR-000L-01MZ1B1I'].estado, 'critico')
  const dif = compararConSheet(productos, sheet, cfg)
  // PLA-X: stock 30 ≥ reorden 28 → la app dice OK; el Sheet dice PEDIR 12.
  assert.deepEqual(dif.map((d) => `${d.clave}:${d.campo}`), ['PLA-X:Estado', 'PLA-X:A PEDIR'])
})

test('parseSupuestosCSV', () => {
  const { config, errores } = parseSupuestosCSV([
    'Supuesto,Valor,Qué significa',
    'Días del periodo 2026,289,1 ene al 16 oct',
    'Días de máximo,42,6 semanas',
    'Días de reorden,28,4 semanas',
    'Días de mínimo crítico,20,2 entregas',
  ].join('\n'))
  assert.deepEqual(errores, [])
  assert.deepEqual(config, { dias_periodo: 289, dias_maximo: 42, dias_reorden: 28, dias_minimo: 20 })
})

test('CSV A PEDIR solo con CRÍTICO y PEDIR', () => {
  const filas = conNiveles(parseNivelesCSV(NIVELES).productos, cfg)
  assert.deepEqual(listaAPedir(filas).map((f) => f.clave), ['CAMFR-000L-01MZ1B1I'])
  const csv = aPedirCSV(filas)
  assert.match(csv, /"CAMISA MEZCLILLA, T-L"/)
  assert.equal(csv.trim().split('\r\n').length, 2)
})
