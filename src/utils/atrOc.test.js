import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparSurtidos, calcularSurtibles, cantidadPropuesta, faltantesCSV, nivelFaltante, prendasParaOrden, revisarSurtido, seleccionInicial, itemsAtrParaGuardar, propuestaSubida,
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
    ['BATA NARANJA TALLA CHICA SIN BOLSAS', 'sin-Naranja', 'S'],
    ['BATA NARANJA TALLA MEDIANA SIN BOLSAS', 'sin-Naranja', 'M'],
    ['BATA NARANJA TALLA GRANDE SIN BOLSAS', 'sin-Naranja', 'L'],
    ['BATA BLNCA TALLA CHICA SIN BOLSAS', 'sin-Blanca', 'S'], // error de dedo en la OC
    ['BATA BLANCA TALLA MEDIANA SIN BOLSAS', 'sin-Blanca', 'M'],
    ['BATA BLANCA TALLA GRANDE SIN BOLSAS', 'sin-Blanca', 'L'],
    ['batas azul cielo sin bolsas talla XL', 'sin-Azul Cielo', 'XL'],
    // Igual, pero como sale el texto pegado del PDF
    ['BATAAZUL CIELOTALLAGRANDESINBOLSAS', 'sin-Azul Cielo', 'L'],
    ['BATABLNCATALLACHICASINBOLSAS', 'sin-Blanca', 'S'],
    ['BATANARANJATALLAMEDIANASINBOLSAS', 'sin-Naranja', 'M'],
    // Otras redacciones
    ['Bata con bolsa Verde Supervisor talla extra grande', 'con-Verde Supervisor', 'XL'],
    ['BATA C/BOLSA GRIS RATA T-3XL', 'con-Gris Rata', '3XL'],
    ['Bata lila talla M', 'sin-Lila', 'M'], // lila solo existe sin bolsa
    // Nombres de Microsip
    ['BATA C/BOLSA ATR AZUL CIELO T-2XL', 'con-Azul Cielo', '2XL'],
    ['BATA S/BOLSA ATR BLANCA T-S', 'sin-Blanca', 'S'],
    ['BATA S/BOLSA ATR GRIS T-XL', 'sin-Gris Rata', 'XL'],
    ['BATA C/BOLSA ATR V.SUPERVISOR T-M', 'con-Verde Supervisor', 'M'],
    ['BATA S/BOLSA ATR V,GRASA T-3XL', 'sin-Verde Grasa', '3XL'],
    ['BATA C/BOLSA ATR A.REY T-5XL', 'con-Azul Rey', '5XL'],
    ['BATA S/BOLSA ATR NARANJA T-XS', 'sin-Naranja', 'XS'],
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
  assert.deepEqual(r[1].sizes, [{ talla: 'M', cantidad: '15', faltan: 15 }, { talla: 'XL', cantidad: '4', faltan: 4 }])
  assert.deepEqual(r[0].sizes, [{ talla: 'M', cantidad: '', faltan: 0 }])
  assert.deepEqual([...seleccionInicial(filas)], ['a|XL', 'a|M'])
})


test('se puede surtir / alcanza pero la ocupa otra / faltan piezas (como Frisa)', () => {
  const ocs = [
    { id: 1, numero_oc: 'C1', estado: 'abierta', fecha_entrega: '2026-12-01' },
    { id: 2, numero_oc: 'C2', estado: 'parcial', fecha_entrega: '2026-12-05' },
    { id: 3, numero_oc: 'C3', estado: 'abierta', fecha_entrega: '2026-12-10' },
    { id: 4, numero_oc: 'C4', estado: 'surtida', fecha_entrega: '2026-11-01' },
  ]
  const L = (oc, p, talla, pendiente, existencia) => ({ oc_linea_id: `${oc}${p}${talla}`, producto_id: p, producto: `Bata ${p}`, talla, pendiente, existencia })
  const lineas = {
    1: [L(1, 'A', 'S', 10, 15)],                       // alcanza: queda 5 de A-S
    2: [L(2, 'A', 'S', 8, 15), L(2, 'B', 'M', 0, 0)],  // sola alcanza (15), pero C1 ocupó 10 → naranja
    3: [L(3, 'B', 'L', 4, 1), L(3, 'A', 'M', 2, 2)],   // falta 3 de B-L → rojo; alcanzan 1+2
    4: [L(4, 'A', 'S', 0, 15)],
  }
  const r = calcularSurtibles(ocs, lineas)
  assert.deepEqual(r.ordenes.map((o) => o.oc.numero_oc), ['C1', 'C2', 'C3'])
  assert.equal(r.porId[1].completa, true)
  assert.equal(r.porId[2].completa, false)
  assert.equal(r.porId[2].alcanzaSola, true)
  assert.deepEqual(r.porId[2].compiteCon, ['C1'])
  assert.deepEqual(r.porId[2].faltantes, [{ producto: 'Bata A', talla: 'S', falta: 3 }])
  assert.equal(r.porId[2].alcanzan, 5)
  assert.equal(r.porId[3].alcanzaSola, false)
  assert.deepEqual(r.porId[3].faltantes, [{ producto: 'Bata B', talla: 'L', falta: 3 }])
  assert.equal(r.porId[3].alcanzan, 3)
  assert.equal(r.porId[3].piezas, 6)
  // Resumen por bata y talla: A-S piden 18, hay 15 → faltan 3; B-L faltan 3
  const as = r.porBata.find((x) => x.producto_id === 'A' && x.talla === 'S')
  assert.deepEqual([as.pendiente, as.existencia, as.falta], [18, 15, 3])
  assert.equal(r.piezasFaltantes, 6)
})

test('estricto por fecha: la que vence antes toma lo que hay aunque no se complete', () => {
  const ocs = [
    { id: 'B', numero_oc: 'B', estado: 'abierta', fecha_entrega: '2026-12-10' },
    { id: 'A', numero_oc: 'A', estado: 'abierta', fecha_entrega: '2026-12-01' },
  ]
  const L = (p, t, pendiente, existencia) => ({ producto_id: p, producto: p, talla: t, pendiente, existencia })
  const r = calcularSurtibles(ocs, { A: [L('Blanca', 'M', 10, 8)], B: [L('Blanca', 'M', 5, 8)] })
  assert.equal(r.porId.A.completa, false)
  assert.equal(r.porId.A.alcanzan, 8) // A se lleva las 8
  assert.deepEqual(r.porId.A.faltantes, [{ producto: 'Blanca', talla: 'M', falta: 2 }])
  assert.equal(r.porId.B.completa, false) // antes salía verde usando piezas que A necesita
  assert.equal(r.porId.B.alcanzan, 0)
  assert.equal(r.porId.B.alcanzaSola, true) // sola alcanzaría (5 <= 8)
  assert.deepEqual(r.porId.B.compiteCon, ['A'])
  assert.deepEqual(r.porId.B.faltantes, [{ producto: 'Blanca', talla: 'M', falta: 5 }])
})

test('misma fecha de entrega: primero el número de OC menor (C19503 antes que C19536)', () => {
  const l = ordenarOcs([
    { id: 'C19536', numero_oc: 'C19536', estado: 'abierta', fecha_entrega: '2026-12-10', fecha_oc: '2026-11-10', creado_en: '2026-11-20' },
    { id: 'C19503', numero_oc: 'C19503', estado: 'abierta', fecha_entrega: '2026-12-10', fecha_oc: '2026-11-10', creado_en: '2026-11-23' },
    { id: 'C19336', numero_oc: 'C19336', estado: 'abierta', fecha_entrega: '2026-12-06', fecha_oc: '2026-11-06' },
    { id: 'C18348', numero_oc: 'C18348', estado: 'abierta', fecha_entrega: '2026-11-05', fecha_oc: '2026-10-06' },
  ])
  assert.deepEqual(l.map((x) => x.id), ['C18348', 'C19336', 'C19503', 'C19536'])
})

test('V223 itemsAtrParaGuardar: cantidades libres, descarta batas sin piezas, exige catálogo ATR', () => {
  const cat = [{ id: 'p1' }, { id: 'p2' }]
  const ok = itemsAtrParaGuardar([
    { producto_id: 'p1', garment: 'Bata', sizes: [{ talla: 'M', cantidad: '40' }, { talla: 'L', cantidad: '0' }] },
    { producto_id: 'p2', garment: 'Bata', sizes: [{ talla: 'S', cantidad: '0' }, { talla: '', cantidad: '' }] },
  ], cat)
  assert.equal(ok.error, undefined)
  assert.deepEqual(ok.items.map((i) => i.producto_id), ['p1'])
  assert.match(itemsAtrParaGuardar([{ producto_id: 'p1', sizes: [{ talla: 'M', cantidad: '0' }] }], cat).error, /al menos una talla/)
  assert.match(itemsAtrParaGuardar([{ garment: 'Bata azul', sizes: [{ talla: 'M', cantidad: '5' }] }], cat).error, /catálogo de ATR.*Bata azul/)
})

test('V223 prendasParaOrden lleva el faltante como referencia', () => {
  const r = prendasParaOrden([{ producto_id: 'x', producto: 'Bata', talla: 'M', faltante: 12 }], [])
  assert.equal(r[0].sizes[0].faltan, 12)
  assert.equal(r[0].sizes[0].cantidad, '12')
})

test('V224 propuestaSubida: surtido si lo hay; si no se capturó, lo pedido', () => {
  assert.deepEqual(propuestaSubida([{ pedida: 10, surtida: 12 }, { pedida: 4, surtida: 0 }]), { sinSurtido: false, cantidades: [12, 0] })
  assert.deepEqual(propuestaSubida([{ pedida: 20, surtida: 0 }, { pedida: 3, surtida: null }]), { sinSurtido: true, cantidades: [20, 3] })
  assert.deepEqual(propuestaSubida([]), { sinSurtido: false, cantidades: [] })
})
