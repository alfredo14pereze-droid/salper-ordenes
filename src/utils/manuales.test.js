// node --test src/utils/manuales.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMarkdown, parseInline, textoPlano } from './markdownManual.js'
import { buscarManuales, fragmento } from './manuales.js'

test('pasos numerados con renglón de continuación y blanco entre pasos', () => {
  const b = parseMarkdown('## Pasos\n\n1. Abre **Frisa**.\n   Está en el menú.\n\n2. Toca Subir.\n3. Listo.\n\nFin.')
  assert.equal(b[0].tipo, 'titulo')
  assert.equal(b[1].tipo, 'pasos')
  assert.equal(b[1].items.length, 3)
  assert.deepEqual(b[1].items[0], ['Abre **Frisa**.', 'Está en el menú.'])
  assert.equal(b[2].tipo, 'parrafo')
})

test('tabla, nota y viñetas', () => {
  const b = parseMarkdown('| A | B |\n|---|---|\n| 1 | 2 |\n\n> **Ojo:** no hagas pruebas.\n\n- uno\n- dos')
  assert.deepEqual(b[0], { tipo: 'tabla', encabezado: ['A', 'B'], filas: [['1', '2']] })
  assert.equal(b[1].tipo, 'nota')
  assert.equal(b[1].bloques[0].tipo, 'parrafo')
  assert.equal(b[2].tipo, 'vinetas')
})

test('inline: negritas, código, ligas seguras', () => {
  const p = parseInline('Toca **Recibir** en `Restock`, ver [ayuda](https://x.mx) y [mala](javascript:alert(1))')
  assert.deepEqual(p.map((x) => x.t).slice(0, 6), ['texto', 'negrita', 'texto', 'codigo', 'texto', 'liga'])
  assert.ok(!p.some((x) => x.t === 'liga' && /javascript/.test(x.href)))
})

test('texto plano sin marcas', () => {
  assert.equal(textoPlano('## Hola\n1. Toca **Surtida toda**.'), 'Hola\nToca Surtida toda.')
})

test('buscador: sin acentos, título primero, sección borrada no sale', () => {
  const secciones = [{ id: 's', orden: 1, nombre: 'Frisa' }]
  const manuales = [
    { id: 'a', seccion_id: 's', orden: 1, titulo: 'Inventario', contenido: 'Revisión de **Microsip** cada 10 días' },
    { id: 'b', seccion_id: 's', orden: 2, titulo: 'Revisión contra Microsip', contenido: 'Sube el Excel.' },
    { id: 'c', seccion_id: 'x', orden: 1, titulo: 'Microsip', contenido: '' },
  ]
  const r = buscarManuales('revision microsip', manuales, secciones)
  assert.deepEqual(r.map((x) => x.manual.id), ['b', 'a'])
  assert.match(r[1].fragmento, /Microsip cada 10 días/)
  assert.deepEqual(buscarManuales('  ', manuales, secciones), [])
})

test('fragmento recorta alrededor de la palabra', () => {
  const plano = 'x'.repeat(200) + ' Planta Santa Catarina ' + 'y'.repeat(200)
  const f = fragmento(plano, ['catarina'])
  assert.ok(f.startsWith('…') && f.endsWith('…') && f.includes('Catarina'))
})
