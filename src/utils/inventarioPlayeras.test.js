// node --test src/utils/inventarioPlayeras.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparPlayeras, generacionDe, grupoContenedor } from './inventarioPlayeras.js'

const it = (talla, tallaOrden, total = 0, extra = {}) => ({ articuloId: `${talla}-${Math.random()}`, talla, tallaOrden, total, ...extra })
const modelo = (id, tipo, variante, items) => ({ key: `m:${id}`, label: [tipo, variante].filter(Boolean).join(' '), modelo: { id, tipo, variante }, items })

test('generacionDe', () => {
  assert.equal(generacionDe('Gen 2032'), 2032)
  assert.equal(generacionDe('Generación 2029'), 2029)
  assert.equal(generacionDe('sin generacion'), null)
  assert.equal(generacionDe('Blanca'), null)
})

test('Tricio: un solo desplegable, generaciones de la más reciente a la más vieja y "Sin generación" al final', () => {
  const grupos = [
    modelo('a', 'Chamarra', 'Bordada', [it('M', 1030)]),
    modelo('g29', 'Playera polo', 'Gen 2029', [it('M', 1030, 3), it('4', 40, 1), it('XS', 1010, 2), it('S', 1020, 0)]),
    modelo('g38', 'Playera polo', 'Gen 2038', [it('8', 80, 2)]),
    modelo('sg', 'Playera polo', 'sin generacion', [it('10', 100, 5), it('12', 120, 0)]),
    modelo('vacia', 'Playera polo', 'Gen 2040', []),
    modelo('ceros', 'Playera polo', 'Gen 2035', [it('6', 60, 0), it('M', 1030, 0)]),
    modelo('dep', 'Playera deportiva', '', [it('S', 1020, 1)]),
  ]
  const vista = agruparPlayeras(grupos)
  assert.deepEqual(vista.map((g) => g.label), ['Chamarra Bordada', 'Playeras'])
  const p = vista[1]
  assert.deepEqual(p.playeras.map((t) => t.label), ['Playera deportiva', 'Playera polo'])
  const polo = p.playeras[1]
  assert.deepEqual(polo.bloques.map((b) => b.titulo), ['Gen 2038', 'Gen 2029', 'Sin generación'])
  assert.deepEqual(polo.bloques[1].grupo.items.map((i) => i.talla), ['4', 'XS', 'M'])
  // la S en 0 de Gen 2029 no se ve; "Sin generación" sí muestra su 12 en 0
  assert.deepEqual(polo.bloques[2].grupo.items.map((i) => i.talla), ['10', '12'])
  assert.equal(polo.total, 13)
  assert.equal(p.playeras[0].bloques[0].titulo, 'Sin generación')
  assert.equal(grupoContenedor(vista, 'm:g29'), 'playeras')
  assert.equal(grupoContenedor(vista, 'm:a'), 'm:a')
})

test('colegio sin generaciones: no cambia nada', () => {
  const grupos = [modelo('p', 'Playera polo', 'Blanca', [it('M', 1030)]), modelo('d', 'Playera deportiva', '', [it('S', 1020)])]
  assert.equal(agruparPlayeras(grupos), grupos)
})

test('prenda sin clasificar con generación en el texto', () => {
  const suelto = { key: 'p:Playera Polo Gen 2032', label: 'Playera Polo Gen 2032', modelo: null, items: [it('6', 60, 1)] }
  const vista = agruparPlayeras([modelo('g29', 'Playera polo', 'Gen 2029', [it('M', 1030, 1)]), suelto])
  assert.deepEqual(vista[0].playeras[0].bloques.map((b) => b.titulo), ['Gen 2032', 'Gen 2029'])
})
