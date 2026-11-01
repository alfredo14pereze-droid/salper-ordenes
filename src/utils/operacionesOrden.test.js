// node --test src/utils/operacionesOrden.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { armarHojasOperaciones, armarOpciones, fijarPrendasOperaciones, prendaOperacionesDe, sugerirPrendaOperaciones } from './operacionesOrden.js'

const prendas = ['CAMISA', 'CHAMARRA ESCOLAR', 'CHAMARRA DE TRABAJO', 'CHAMARRA CON FORRO', 'CHAMARRA DOMUS', 'PANTS DOMUS']

test('sugiere por prenda + cliente', () => {
  assert.equal(sugerirPrendaOperaciones('Chamarra', 'Colegio Domus', prendas), 'CHAMARRA DOMUS')
  assert.equal(sugerirPrendaOperaciones('chamarra bordada', 'DOMUS', prendas), 'CHAMARRA DOMUS')
  assert.equal(sugerirPrendaOperaciones('Pants', 'Colegio Domus', prendas), 'PANTS DOMUS')
  assert.equal(sugerirPrendaOperaciones('Playera', 'Colegio Domus', prendas), null)
  assert.equal(sugerirPrendaOperaciones('Chamarra', 'Colegio Echavarría', prendas), null)
  // "Escolar" es genérica: no amarra CHAMARRA ESCOLAR a cualquier colegio.
  assert.equal(sugerirPrendaOperaciones('Chamarra', 'Centro Escolar Tricio', prendas), null)
  assert.equal(sugerirPrendaOperaciones('', 'Colegio Domus', prendas), null)
  assert.equal(sugerirPrendaOperaciones('Chamarra', '', prendas), null)
})

test('lo escogido gana a la sugerencia', () => {
  assert.equal(prendaOperacionesDe({ garment: 'Chamarra' }, 'Domus', prendas), 'CHAMARRA DOMUS')
  assert.equal(prendaOperacionesDe({ garment: 'Chamarra', prenda_operaciones: '' }, 'Domus', prendas), '')
  assert.equal(prendaOperacionesDe({ garment: 'Chamarra', prenda_operaciones: 'CHAMARRA ESCOLAR' }, 'Domus', prendas), 'CHAMARRA ESCOLAR')
})

test('al guardar queda escrita', () => {
  const items = [{ garment: 'Chamarra' }, { garment: 'Playera' }]
  assert.deepEqual(fijarPrendasOperaciones(items, 'Domus', prendas).map((i) => i.prenda_operaciones), ['CHAMARRA DOMUS', ''])
  assert.equal(fijarPrendasOperaciones(items, 'Domus', null), items)
})

test('hojas del PDF: una por prenda con operaciones, agrupada por parte', () => {
  const ops = [
    { folio: 1603, prenda: 'CHAMARRA DOMUS', parte: 'CUELLO', operacion: 'C', segundos: 10 },
    { folio: 1601, prenda: 'CHAMARRA DOMUS', parte: 'MANGA', operacion: 'A', segundos: 10 },
    { folio: 1602, prenda: 'CHAMARRA DOMUS', parte: 'CUELLO', operacion: 'B', segundos: 10 },
  ]
  const items = [
    { garment: 'Chamarra', sizes: [{ talla: 'M', cantidad: 3 }, { talla: 'L', cantidad: 2 }] },
    { garment: 'Playera', sizes: [] },
    { garment: 'Chamarra', prenda_operaciones: '', sizes: [] },
  ]
  const hojas = armarHojasOperaciones(items, 'Colegio Domus', prendas, ops)
  assert.equal(hojas.length, 1)
  assert.equal(hojas[0].piezas, 5)
  assert.deepEqual(hojas[0].grupos.map((g) => [g.parte, g.operaciones.map((o) => o.folio)]), [['MANGA', [1601]], ['CUELLO', [1602, 1603]]])
})

test('hojas guardadas: se escogen, se sugieren y salen con su título', () => {
  const hojas = [{ id: 'h1', titulo: 'CHAMARRA VASCO DE QUIROGA SECUNDARIA', prenda: 'CHAMARRA ESCOLAR', operaciones: [
    { folio: 705, parte: 'CUELLO', operacion: 'X', segundos: 10 },
    { folio: 701, parte: 'MANGA', operacion: 'Y', segundos: 12 },
  ] }]
  const opciones = armarOpciones(prendas, hojas)
  assert.equal(sugerirPrendaOperaciones('Chamarra', 'Colegio Vasco de Quiroga', opciones), 'hoja:h1')
  assert.equal(sugerirPrendaOperaciones('Chamarra', 'Colegio Domus', opciones), 'CHAMARRA DOMUS')
  const r = armarHojasOperaciones([{ garment: 'Chamarra', sizes: [{ talla: 'M', cantidad: 4 }] }], 'Colegio Vasco de Quiroga', opciones, [], hojas)
  assert.equal(r.length, 1)
  assert.equal(r[0].prenda, 'CHAMARRA VASCO DE QUIROGA SECUNDARIA')
  assert.deepEqual(r[0].grupos.map((g) => g.parte), ['MANGA', 'CUELLO'])
  // Hoja que ya no existe: no sale nada.
  assert.equal(armarHojasOperaciones([{ garment: 'X', prenda_operaciones: 'hoja:zz' }], '', opciones, [], hojas).length, 0)
})
