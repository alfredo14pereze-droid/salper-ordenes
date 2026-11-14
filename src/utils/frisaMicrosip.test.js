import { test } from 'node:test'
import assert from 'node:assert/strict'
import { articulosDeFilas, articulosDeCSV, columnasDelReporte, totalDelReporte, fechaDelReporte, ligarMicrosip, diasDesde } from './frisaMicrosip.js'

const filas = [
  ['SALPER S.A. DE C.V.'], ['Existencia y valor del inventario'], ['Al 31 de diciembre del 2026'], ['Línea: FRISA'],
  ['Artículo', null, 'Existencia'], [],
  ['1027943', 'PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-M', 75],
  ['PLAFR-02XL-01MCRO2I', 'PLAYERA ROJA T-2XL', 55],
  ['1024762', 'PLAYERA C/R M/L S/REFLEJANTE 1 IMP. AZUL M.  FRISA T-XL', 85],
  ['9999999', 'GUANTE DE CARNAZA', 4],
  ['Total 4 artículos', null, 219], ['1 artículos sin existencia'],
]
const productos = [
  { id: 'v', clave: 'PLAFR-000M-01MCVE2I', nombre: 'PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-M', stock_actual: 14 },
  { id: 'r', clave: 'PLAFR-02XL-01MCRO2I', nombre: 'PLAYERA C/R M/C S/REFLEJANTE 2 IMP. ROJA FRISA T-2XL', stock_actual: 55 },
  { id: 'a', clave: 'PLAFR-00XL-01MLMA1IS', nombre: 'PLAYERA C/R M/L S/REFLEJANTE 1 IMP. AZUL M. FRISA T-XL', stock_actual: 85 },
  { id: 'b', clave: 'BOLFR-0000-01MEZC', nombre: 'BOLSA', stock_actual: 0 },
]

test('lee artículos, total y fecha del reporte', () => {
  const a = articulosDeFilas(filas)
  assert.equal(a.length, 4)
  assert.deepEqual(a[0], { codigo: '1027943', nombre: 'PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-M', existencia: 75 })
  assert.deepEqual(totalDelReporte(filas), { articulos: 4, piezas: 219 })
  assert.equal(fechaDelReporte(filas), '2026-12-31')
})

test('también desde CSV', () => {
  const a = articulosDeCSV('Artículo,,Existencia\n1027943,"PLAYERA VERDE, T-M","1,075"\nTotal 1 artículos,,1075\n')
  assert.deepEqual(a, [{ codigo: '1027943', nombre: 'PLAYERA VERDE, T-M', existencia: 1075 }])
})

test('liga por código aprendido, por clave y por nombre (espacios de más), y compara', () => {
  const r = ligarMicrosip(articulosDeFilas(filas), productos, [{ codigo: '1027943', producto_id: 'v' }])
  const como = Object.fromEntries(r.lineas.map((l) => [l.producto.id, l.como]))
  assert.deepEqual(como, { v: 'aprendido', r: 'clave', a: 'nombre' })
  assert.deepEqual(r.lineas[0], { producto: productos[0], codigo: '1027943', nombreMicrosip: productos[0].nombre, microsip: 75, pagina: 14, diferencia: 61, como: 'aprendido' })
  assert.deepEqual(r.sinLigar.map((x) => x.codigo), ['9999999'])
  assert.deepEqual(r.faltan.map((p) => p.id), ['b'])
})

test('días desde la última revisión', () => {
  assert.equal(diasDesde('2026-10-27', new Date(2026, 10, 6)), 10)
  assert.equal(diasDesde(null), null)
})

test('reporte con "Solo artículos con disponible": nombre en la C y cantidad en "Disponible" (L)', () => {
  const v = (codigo, nombre, n) => [codigo, null, nombre, null, null, null, null, 'Pza', null, null, null, n]
  const marzo = [
    ['SALPER S.A. DE C.V.'], ['Existencia y valor del inventario'], ['Al 31 de diciembre del 2026'], ['Solo existencias'],
    ['Solo artículos con disponible'], ['Artículo', null, null, null, null, null, null, 'U. med.', null, null, null, 'Disponible'], [],
    ['Línea: FRISA'],
    v('1012564', 'PANTALON DE MEZCLILLA TALLA 34 14OZ FRISA LARGO 34', 23),
    v('PLAFR-03XL-01MCRO2I', 'PLAYERA C/R M/C S/REFLEJANTE 2 IMP. ROJA FRISA T-3XL', 19),
    ['2 artículos en FRISA', null, null, null, null, null, null, null, null, null, null, 42],
  ]
  assert.deepEqual(columnasDelReporte(marzo), { cantidad: 11, columna: 'Disponible' })
  assert.deepEqual(articulosDeFilas(marzo), [
    { codigo: '1012564', nombre: 'PANTALON DE MEZCLILLA TALLA 34 14OZ FRISA LARGO 34', existencia: 23 },
    { codigo: 'PLAFR-03XL-01MCRO2I', nombre: 'PLAYERA C/R M/C S/REFLEJANTE 2 IMP. ROJA FRISA T-3XL', existencia: 19 },
  ])
  assert.deepEqual(totalDelReporte(marzo), { articulos: 2, piezas: 42 })
  assert.equal(fechaDelReporte(marzo), '2026-12-31')
})

test('si trae "Existencia" y "Disponible", gana "Existencia"', () => {
  const f = [['Artículo', null, 'Existencia', 'Disponible'], ['1', 'X', 5, 3]]
  assert.deepEqual(columnasDelReporte(f), { cantidad: 2, columna: 'Existencia' })
  assert.equal(articulosDeFilas(f)[0].existencia, 5)
})
