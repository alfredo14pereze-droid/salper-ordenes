import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fechaExcel, tipoDeHoja, leerDiarios, ligarDocs, separarNuevos, prendaYTalla, calcularPlantas, resumenArchivo, docsParaImportar } from './frisaPlantas.js'

const hoja = (nombre, filas) => ({ nombre, filas })
const ENC = ['Fecha', 'Folio', 'Cliente', 'Orden', 'Artículo', 'Unidades']

test('fechaExcel: número de Excel y textos', () => {
  assert.equal(fechaExcel(46092), '2026-03-11')
  assert.equal(fechaExcel('2026-10-16'), '2026-10-16')
  assert.equal(fechaExcel('5/10/2026'), '2026-10-05')
  assert.equal(fechaExcel('FRISA'), null)
})

test('tipoDeHoja por nombre o por Concepto', () => {
  assert.equal(tipoDeHoja('Entregas', []), 'remision')
  assert.equal(tipoDeHoja('Facturado', []), 'factura')
  assert.equal(tipoDeHoja('Hoja1', [['Diarios del inventario'], ['Concepto: Remisión']]), 'remision')
  assert.equal(tipoDeHoja('Hoja1', [['Concepto: Venta']]), 'factura')
  assert.equal(tipoDeHoja('Otra', [['nada']]), null)
})

test('leerDiarios: documentos, artículos, direcciones y totales', () => {
  const r = leerDiarios([hoja('Hoja1', [
    ['Concepto: Remisión'], ENC,
    [46311, 'R-100', 'FRISA VILLA GARCÍA', '4500', null, 12],
    [null, null, null, null, 'CARRETERA KM 3 C.P. 66000', null],
    [null, null, null, null, 'PLAYERA  ROJA T-M', 10],
    [null, null, null, null, 'PLAYERA ROJA T-L', 3],
  ])])
  assert.equal(r.docs.length, 1)
  const d = r.docs[0]
  assert.deepEqual([d.tipo, d.folio, d.fecha, d.planta, d.orden], ['remision', 'R-100', '2026-10-16', 'FRISA VILLA GARCIA', '4500'])
  assert.deepEqual(d.lineas.map((l) => [l.descripcion, l.cantidad]), [['PLAYERA ROJA T-M', 10], ['PLAYERA ROJA T-L', 3]])
  assert.equal(r.avisos.length, 1) // total 12 ≠ 13
})

test('ligar, separar folios repetidos y armar el envío', () => {
  const productos = [{ id: 'a', clave: 'A', nombre: 'Playera Roja T-M' }]
  const { docs } = leerDiarios([hoja('Entregas', [ENC,
    [46311, 'R-1', 'FRISA ACERIA', '', null, 2], [null, null, null, null, 'PLAYERA ROJA T-M', 2],
    [46311, 'R-2', 'FRISA ACERIA', '', null, 1], [null, null, null, null, 'OTRA COSA', 1],
    [46311, 'R-2', 'FRISA ACERIA', '', null, 1], [null, null, null, null, 'OTRA COSA', 1],
  ])])
  const l = ligarDocs(docs, productos)
  assert.deepEqual(l.sinClave, [{ descripcion: 'OTRA COSA', piezas: 2 }])
  const s = separarNuevos(l.docs, [{ tipo: 'remision', folio: 'R-1' }])
  assert.deepEqual(s.nuevos.map((d) => d.folio), ['R-2'])
  assert.equal(s.repetidos.length, 2)
  const env = docsParaImportar(l.docs.slice(0, 1))
  assert.deepEqual(env[0].lineas, [{ producto_id: 'a', descripcion: 'PLAYERA ROJA T-M', cantidad: 2 }])
  const res = resumenArchivo(l.docs, [{ id: 'p', nombre: 'Acería', nombre_microsip: 'FRISA ACERIA' }])
  assert.equal(res.remisiones, 3)
  assert.equal(res.piezasRemitidas, 2)
  assert.deepEqual(resumenArchivo([{ ...l.docs[0], planta: 'FRISA MARTE' }], []).plantasDesconocidas, ['FRISA MARTE'])
})

test('prendaYTalla', () => {
  assert.deepEqual(prendaYTalla('PANTALON MEZCLILLA TALLA 34 FRISA LARGO 32'), { prenda: 'PANTALON MEZCLILLA FRISA', talla: '34 (L32)' })
  assert.deepEqual(prendaYTalla('PLAYERA AZUL T-2XL'), { prenda: 'PLAYERA AZUL', talla: '2XL' })
  assert.deepEqual(prendaYTalla('CHALECO'), { prenda: 'CHALECO', talla: 'Única' })
})

test('calcularPlantas: stock = remisiones − facturas, negativos', () => {
  const plantas = [{ id: 'p2', nombre: 'B', orden: 2 }, { id: 'p1', nombre: 'A', orden: 1 }]
  const productos = [{ id: 'x', clave: 'X', nombre: 'PLAYERA T-M' }, { id: 'y', clave: 'Y', nombre: 'PLAYERA T-S' }]
  const c = calcularPlantas([
    { planta_id: 'p1', producto_id: 'x', tipo: 'remision', cantidad: 10 },
    { planta_id: 'p1', producto_id: 'x', tipo: 'factura', cantidad: -4 },
    { planta_id: 'p2', producto_id: 'y', tipo: 'factura', cantidad: -1 },
  ], plantas, productos)
  assert.deepEqual(c.plantas.map((p) => p.id), ['p1', 'p2'])
  assert.deepEqual(c.totales, { remitido: 10, facturado: 5, stock: 5 })
  assert.deepEqual(c.claves.map((k) => [k.producto.clave, k.talla, k.stock]), [['Y', 'S', -1], ['X', 'M', 6]])
  assert.equal(c.prendas.length, 1)
  assert.deepEqual(c.negativos.map((n) => [n.planta.id, n.stock]), [['p2', -1]])
})
