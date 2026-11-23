import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparSurtidos, cantidadPropuesta, faltantesCSV, nivelFaltante, prendasParaOrden, revisarSurtido, seleccionInicial,
  ocRepetida, ordenarOcs, pctSurtido, problemaRenglon, renglonesDesdePdf, repetidos, sugerirBata, textoAlias, urgenciaEntrega,
} from './atrOc.js'

const productos = [
  { id: 'a', nombre: 'Bata con bolsa Blanca', color: 'Blanca', con_bolsa: true, tallas: ['CH', 'M', 'L'] },
  { id: 'b', nombre: 'Bata sin bolsa Blanca', color: 'Blanca', con_bolsa: false, tallas: ['CH', 'M', 'L'] },
  { id: 'c', nombre: 'Bata con bolsa Azul Marino', color: 'Azul Marino', con_bolsa: true, tallas: ['CH', 'M', 'L'] },
]

test('sugerir bata: aprendido gana, luego la descripción', () => {
  assert.deepEqual(sugerirBata('BATA AZUL MARINO C/BOLSA', productos), { producto_id: 'c', como: 'descripcion', talla: '' })
  assert.deepEqual(sugerirBata('Bata sin bolsa blanca', productos), { producto_id: 'b', como: 'descripcion', talla: '' })
  assert.deepEqual(sugerirBata('Bata blanca', productos), { producto_id: '', como: null, talla: '' }) // blanca hay con y sin bolsa
  assert.deepEqual(sugerirBata('Bata  blanca', productos, { 'bata blanca': 'a' }), { producto_id: 'a', como: 'aprendido', talla: '' })
  assert.equal(sugerirBata('Bata blanca', productos, { 'bata blanca': 'zzz' }).producto_id, '') // alias a producto que ya no está
  assert.equal(textoAlias('  BATA   Lila '), 'bata lila')
})

// Catálogo real de ATR (V209, Verde Jade → Verde Supervisor)
const CATALOGO = [
  ...['Blanca', 'Café', 'Gris Rata', 'Negra', 'Azul Rey', 'Verde Supervisor', 'Azul Marino', 'Guinda', 'Azul Cielo'].map((c) => ({ id: `con-${c}`, color: c, con_bolsa: true })),
  ...['Negra', 'Naranja', 'Lila', 'Verde Bandera', 'Guinda', 'Verde Fosfo', 'Beige', 'Amarillo', 'Paja', 'Gris Rata', 'Verde Grasa', 'Café', 'Azul Cielo', 'Blanca'].map((c) => ({ id: `sin-${c}`, color: c, con_bolsa: false })),
]

test('OC real de ATR (C19536, planta Río Grande): color + talla + bolsa por la descripción', () => {
  const casos = [
    ['BATA AZUL CIELO TALLA GRANDE SIN BOLSAS', 'sin-Azul Cielo', 'L'],
    ['BATA AZUL CIELO TALLA 2XL SIN BOLSAS', 'sin-Azul Cielo', '2XL'],
    ['BATA NARANJA TALLA CHICA SIN BOLSAS', 'sin-Naranja', 'CH'],
    ['BATA NARANJA TALLA MEDIANA SIN BOLSAS', 'sin-Naranja', 'M'],
    ['BATA NARANJA TALLA GRANDE SIN BOLSAS', 'sin-Naranja', 'L'],
    ['BATA BLNCA TALLA CHICA SIN BOLSAS', 'sin-Blanca', 'CH'], // error de dedo en la OC
    ['BATA BLANCA TALLA MEDIANA SIN BOLSAS', 'sin-Blanca', 'M'],
    ['BATA BLANCA TALLA GRANDE SIN BOLSAS', 'sin-Blanca', 'L'],
    ['batas azul cielo sin bolsas talla XL', 'sin-Azul Cielo', 'XL'],
    // Igual, pero como sale el texto pegado del PDF
    ['BATAAZUL CIELOTALLAGRANDESINBOLSAS', 'sin-Azul Cielo', 'L'],
    ['BATABLNCATALLACHICASINBOLSAS', 'sin-Blanca', 'CH'],
    ['BATANARANJATALLAMEDIANASINBOLSAS', 'sin-Naranja', 'M'],
    // Otras redacciones
    ['Bata con bolsa Verde Supervisor talla extra grande', 'con-Verde Supervisor', 'XL'],
    ['BATA C/BOLSA GRIS RATA T-3XL', 'con-Gris Rata', '3XL'],
    ['Bata lila talla M', 'sin-Lila', 'M'], // lila solo existe sin bolsa
  ]
  for (const [txt, id, talla] of casos) {
    const s = sugerirBata(txt, CATALOGO)
    assert.equal(s.producto_id, id, txt)
    assert.equal(s.talla, talla, txt)
  }
  // Sin decir bolsa y el color existe con y sin bolsa: no adivina
  assert.equal(sugerirBata('BATA AZUL CIELO TALLA M', CATALOGO).producto_id, '')
  // Color que no existe: no adivina
  assert.equal(sugerirBata('BATA MORADA SIN BOLSA TALLA M', CATALOGO).producto_id, '')
})

test('la talla del PDF gana; si no viene, sale de la descripción', () => {
  const r = renglonesDesdePdf([
    { nombre: 'BATA NARANJA TALLA GRANDE SIN BOLSAS', talla: null, cantidad: 6 },
    { nombre: 'BATA NARANJA TALLA GRANDE SIN BOLSAS', talla: 'xl', cantidad: 6 },
  ], CATALOGO, {})
  assert.equal(r[0].talla, 'L')
  assert.equal(r[1].talla, 'XL')
  assert.equal(r[0].producto_id, 'sin-Naranja')
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


test('nivel de faltante: rojo, amarillo por taller, nada', () => {
  assert.equal(nivelFaltante({ pendiente: 25, existencia: 10, en_taller: 0, faltante: 15 }), 'rojo')
  assert.equal(nivelFaltante({ pendiente: 25, existencia: 10, en_taller: 15, faltante: 0 }), 'amarillo')
  assert.equal(nivelFaltante({ pendiente: 5, existencia: 10, en_taller: 15, faltante: 0 }), null)
  assert.equal(nivelFaltante({ pendiente: 5, existencia: -3, en_taller: 5, faltante: 0 }), 'amarillo')
})

test('CSV de faltantes con BOM y comillas', () => {
  const csv = faltantesCSV([{ producto: 'Bata, con "bolsa"', talla: 'M', pendiente: 3, existencia: 1, en_taller: 0, faltante: 2, en_taller_ordenes: [{ order_number: 'IND-1', cantidad: 4 }] }])
  assert.ok(csv.startsWith('﻿Bata,Talla'))
  assert.ok(csv.includes('"Bata, con ""bolsa""",M,3,1,0,2,IND-1 (4)'))
})

test('cantidad propuesta y revisión del surtido', () => {
  assert.equal(cantidadPropuesta({ pendiente: 25, existencia: 10 }), 10)
  assert.equal(cantidadPropuesta({ pendiente: 5, existencia: 10 }), 5)
  assert.equal(cantidadPropuesta({ pendiente: 5, existencia: -2 }), 0)
  const lineas = [
    { oc_linea_id: 1, producto: 'A', talla: 'M', pendiente: 10, existencia: 4 },
    { oc_linea_id: 2, producto: 'B', talla: 'L', pendiente: 3, existencia: 3 },
    { oc_linea_id: 3, producto: 'C', talla: 'XL', pendiente: 2, existencia: 2 },
  ]
  const r = revisarSurtido(lineas, { 1: '6', 2: '4', 3: '' })
  assert.deepEqual(r.lineas, [{ oc_linea_id: 1, cantidad: 6 }])
  assert.equal(r.errores.length, 1)
  assert.deepEqual(r.negativos, ['A M (hay 4, salen 6)'])
  assert.equal(revisarSurtido(lineas, { 1: 'x' }).errores[0], 'A M: cantidad inválida')
})

test('agrupar surtidos y marcar deshechos', () => {
  const lineas = [{ oc_linea_id: 1, producto: 'Bata A' }, { oc_linea_id: 2, producto: 'Bata B' }]
  const g = agruparSurtidos([
    { surtido_id: 's1', tipo: 'salida_surtido', oc_linea_id: 1, talla: 'M', cantidad: -5, creado_en: '2026-11-20T10:00', usuario_nombre: 'Ana' },
    { surtido_id: 's1', tipo: 'salida_surtido', oc_linea_id: 2, talla: 'L', cantidad: -2, creado_en: '2026-11-20T10:00', usuario_nombre: 'Ana' },
    { surtido_id: 's2', tipo: 'salida_surtido', oc_linea_id: 1, talla: 'M', cantidad: -1, creado_en: '2026-11-21T10:00', usuario_nombre: 'Leo' },
    { surtido_id: 's1', tipo: 'reversa_surtido', oc_linea_id: 1, talla: 'M', cantidad: 5, creado_en: '2026-11-22T10:00', usuario_nombre: 'Admin', nota: 'error' },
  ], lineas)
  assert.deepEqual(g.map((x) => x.surtido_id), ['s2', 's1'])
  assert.equal(g[1].piezas, 7)
  assert.equal(g[1].deshecho.motivo, 'error')
  assert.equal(g[0].deshecho, null)
})


test('prendas para la orden de taller: una por bata, tallas en orden, cantidad = faltante', () => {
  const productos = [{ id: 'a', nombre: 'Bata con bolsa Blanca', garment: 'Bata', color: 'Blanca' }, { id: 'c', nombre: 'Bata con bolsa Azul Marino', garment: 'Bata' }]
  const filas = [
    { producto_id: 'a', talla: 'XL', faltante: 4 },
    { producto_id: 'a', talla: 'M', faltante: 15 },
    { producto_id: 'c', talla: 'M', faltante: 0 },
  ]
  const r = prendasParaOrden(filas, productos)
  assert.deepEqual(r.map((g) => g.producto.id), ['c', 'a'])
  assert.deepEqual(r[1].sizes, [{ talla: 'M', cantidad: '15' }, { talla: 'XL', cantidad: '4' }])
  assert.deepEqual(r[0].sizes, [{ talla: 'M', cantidad: '' }])
  assert.deepEqual([...seleccionInicial(filas)], ['a|XL', 'a|M'])
})
