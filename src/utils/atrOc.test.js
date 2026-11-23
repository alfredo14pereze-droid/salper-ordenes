import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ocRepetida, ordenarOcs, pctSurtido, problemaRenglon, renglonesDesdePdf, repetidos, sugerirBata, textoAlias, urgenciaEntrega,
} from './atrOc.js'

const productos = [
  { id: 'a', nombre: 'Bata con bolsa Blanca', color: 'Blanca', con_bolsa: true, tallas: ['CH', 'M', 'L'] },
  { id: 'b', nombre: 'Bata sin bolsa Blanca', color: 'Blanca', con_bolsa: false, tallas: ['CH', 'M', 'L'] },
  { id: 'c', nombre: 'Bata con bolsa Azul Marino', color: 'Azul Marino', con_bolsa: true, tallas: ['CH', 'M', 'L'] },
]

test('sugerir bata: aprendido gana, luego parecido', () => {
  assert.deepEqual(sugerirBata('BATA AZUL MARINO C/BOLSA', productos), { producto_id: 'c', como: 'parecido' })
  assert.deepEqual(sugerirBata('Bata sin bolsa blanca', productos), { producto_id: 'b', como: 'parecido' })
  assert.deepEqual(sugerirBata('Bata blanca', productos), { producto_id: '', como: null }) // sin con/sin bolsa
  assert.deepEqual(sugerirBata('Bata  blanca', productos, { 'bata blanca': 'a' }), { producto_id: 'a', como: 'aprendido' })
  assert.deepEqual(sugerirBata('Bata blanca', productos, { 'bata blanca': 'zzz' }), { producto_id: '', como: null }) // alias a producto que ya no está
  assert.equal(textoAlias('  BATA   Lila '), 'bata lila')
})

test('renglones desde el PDF normalizan talla', () => {
  const r = renglonesDesdePdf([{ nombre: 'Bata c/bolsa blanca', talla: 'xxl', cantidad: 12 }], productos, {})
  assert.equal(r[0].talla, '2XL')
  assert.equal(r[0].cantidad, '12')
  assert.equal(r[0].producto_id, 'a')
})

test('problemas y repetidos', () => {
  assert.equal(problemaRenglon({ producto_id: '', talla: 'M', cantidad: '2' }), 'Sin bata: asígnala o dala de alta')
  assert.equal(problemaRenglon({ producto_id: 'a', talla: '', cantidad: '2' }), 'Sin talla')
  assert.match(problemaRenglon({ producto_id: 'a', talla: '5XL', cantidad: '2' }, ['CH', 'M']), /no existe/)
  assert.equal(problemaRenglon({ producto_id: 'a', talla: 'M', cantidad: '0' }), 'Cantidad inválida')
  assert.equal(problemaRenglon({ producto_id: 'a', talla: 'M', cantidad: '3' }, ['M']), null)
  assert.deepEqual([...repetidos([{ producto_id: 'a', talla: 'M' }, { producto_id: 'a', talla: 'M' }, { producto_id: 'a', talla: 'L' }])], ['a|M'])
})

test('OC repetida ignora canceladas, espacios y mayúsculas', () => {
  const lista = [{ numero_oc: 'OC 15', estado: 'cancelada' }, { numero_oc: 'oc-16', estado: 'abierta' }]
  assert.equal(ocRepetida('OC15', lista), null)
  assert.equal(ocRepetida(' OC-16 ', lista).numero_oc, 'oc-16')
})

test('orden de la lista y % surtido', () => {
  const l = ordenarOcs([
    { id: 1, estado: 'surtida', creado_en: '2026-11-01' },
    { id: 2, estado: 'abierta', fecha_entrega: null, creado_en: '2026-11-02' },
    { id: 3, estado: 'parcial', fecha_entrega: '2026-12-01' },
    { id: 4, estado: 'abierta', fecha_entrega: '2026-11-25' },
    { id: 5, estado: 'cancelada', creado_en: '2026-11-20' },
  ])
  assert.deepEqual(l.map((x) => x.id), [4, 3, 2, 1, 5])
  assert.equal(pctSurtido({ pedido: 3, surtido: 1 }), 33)
  assert.equal(pctSurtido({ pedido: 0, surtido: 0 }), 0)
})

test('urgencia como en órdenes', () => {
  assert.equal(urgenciaEntrega('abierta', -2).nivel, 'overdue')
  assert.equal(urgenciaEntrega('abierta', 0).texto, 'Entrega hoy')
  assert.equal(urgenciaEntrega('parcial', 3).nivel, 'overdue')
  assert.equal(urgenciaEntrega('abierta', 6).nivel, 'warning')
  assert.equal(urgenciaEntrega('abierta', 10).nivel, null)
  assert.equal(urgenciaEntrega('surtida', -5).nivel, 'good')
  assert.equal(urgenciaEntrega('abierta', null).texto, 'Sin fecha de entrega')
})
