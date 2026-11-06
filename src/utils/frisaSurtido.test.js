import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  conInventario, calcularUrgente, faltantesDeOrden, sugerirClave, tallaDeProducto, normalizarTalla, textoAlias, textoLimite,
} from './frisaSurtido.js'

const productos = [
  { id: 'v', clave: 'PLAFR-000M-01MCVE2I', nombre: 'PLAYERA C/R M/C C/REFLEJANTE 2 IMP. VERDE FRISA T-M', stock_actual: 14 },
  { id: 'a', clave: 'PLAFR-000M-01MCMA1I', nombre: 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. A.MARINO FRISA T-M', stock_actual: 180 },
  { id: 'al', clave: 'PLAFR-000L-01MCMA1I', nombre: 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. A.MARINO FRISA T-L', stock_actual: 115 },
  { id: 'p', clave: 'PANFR-0032-01MEZ', nombre: 'PANTALON DE MEZCLILLA TALLA 32 14OZ FRISA', stock_actual: 124 },
  { id: 'pl', clave: 'PANFR-3234-01MEZ', nombre: 'PANTALON DE MEZCLILLA TALLA 32 14OZ FRISA LARGO 34', stock_actual: 20 },
]

test('real / apartado / disponible', () => {
  const surtidos = [{ id: 's1', estado: 'surtida' }, { id: 's2', estado: 'pendiente' }, { id: 's3', estado: 'entregada' }]
  const lineas = [
    { surtido_id: 's1', producto_id: 'v', cantidad: 10 },
    { surtido_id: 's2', producto_id: 'v', cantidad: 3 },
    { surtido_id: 's3', producto_id: 'v', cantidad: 99 },
  ]
  const v = conInventario(productos, surtidos, lineas).find((p) => p.id === 'v')
  assert.deepEqual([v.real, v.apartado, v.disponible], [14, 10, 4])
})

test('Urgente: por fecha límite, todo o nada', () => {
  const inv = conInventario(productos, [], [])
  const surtidos = [
    { id: 'tarde', estado: 'pendiente', fecha_limite: '2026-11-20' },
    { id: 'pronto', estado: 'pendiente', fecha_limite: '2026-11-08' },
    { id: 'chica', estado: 'pendiente', fecha_limite: '2026-11-25' },
  ]
  const lineas = [
    { surtido_id: 'pronto', producto_id: 'v', clave: 'V', cantidad: 10 },
    { surtido_id: 'tarde', producto_id: 'v', clave: 'V', cantidad: 10 }, // ya no alcanza (quedan 4)
    { surtido_id: 'tarde', producto_id: 'a', clave: 'A', cantidad: 5 },
    { surtido_id: 'chica', producto_id: 'v', clave: 'V', cantidad: 4 }, // alcanza: la "tarde" no tomó nada
  ]
  const u = calcularUrgente(inv, surtidos, lineas)
  assert.deepEqual(u.ordenes.map((o) => [o.surtido.id, o.completa]), [['pronto', true], ['tarde', false], ['chica', true]])
  assert.deepEqual(u.ordenes[1].faltantes, [{ producto_id: 'v', clave: 'V', falta: 6 }])
  assert.equal(u.completas, 2)
  const v = u.porClave.find((c) => c.producto.id === 'v')
  assert.deepEqual([v.pendiente, v.disponible, v.falta], [24, 14, 10])
  assert.equal(u.piezasFaltantes, 10)
})

test('faltantes de una orden contra el disponible de hoy', () => {
  const inv = conInventario(productos, [], [])
  const f = faltantesDeOrden([{ producto_id: 'v', cantidad: 20 }, { producto_id: 'a', cantidad: 1 }], inv)
  assert.deepEqual(f.map((x) => x.falta), [6, 0])
})

test('tallas', () => {
  assert.equal(tallaDeProducto(productos[0]), 'M')
  assert.equal(tallaDeProducto(productos[3]), '32')
  assert.equal(tallaDeProducto(productos[4]), '32/34')
  assert.equal(tallaDeProducto({ nombre: 'X FRISA T-2XL' }), '2XL')
  assert.equal(normalizarTalla('XXL'), '2XL')
  assert.equal(normalizarTalla('T-m'), 'M')
  assert.equal(normalizarTalla('032'), '32')
})

test('sugerir clave: aprendido, luego parecido con la talla', () => {
  assert.deepEqual(sugerirClave('Playera manga corta marino reflejante', 'L', productos), { producto_id: 'al', como: 'parecido' })
  assert.deepEqual(sugerirClave('Playera verde 2 impresiones', 'M', productos), { producto_id: 'v', como: 'parecido' })
  assert.deepEqual(sugerirClave('Pantalón mezclilla 14oz', '32', productos), { producto_id: 'p', como: 'parecido' })
  const alias = [{ texto: textoAlias('PLAYERA X  rara', 'm'), producto_id: 'a' }]
  assert.deepEqual(sugerirClave('playera x rara', 'M', productos, alias), { producto_id: 'a', como: 'aprendido' })
  assert.deepEqual(sugerirClave('Bota industrial', 'M', productos), { producto_id: null, como: null })
})

test('sugerir clave: distingue manga corta/larga y con/sin reflejante', () => {
  const ps = [
    { id: 'mc', nombre: 'PLAYERA C/R M/C C/REFLEJANTE 1 IMP. A.MARINO FRISA T-M' },
    { id: 'ml', nombre: 'PLAYERA C/R M/L C/REFLEJANTE 1 IMP. A.MARINO FRISA T-M' },
    { id: 'mls', nombre: 'PLAYERA C/R M/L S/REFLEJANTE 1 IMP. AZUL M. FRISA T-M' },
  ]
  assert.equal(sugerirClave('Playera manga larga azul marino sin reflejante', 'M', ps).producto_id, 'mls')
  assert.equal(sugerirClave('Playera manga larga azul marino con reflejante', 'M', ps).producto_id, 'ml')
  assert.equal(sugerirClave('Playera M/C marino c/reflejante', 'M', ps).producto_id, 'mc')
})

test('texto de la fecha límite', () => {
  assert.deepEqual(textoLimite('2026-11-05', '2026-11-06'), { texto: 'Vencida hace 1 día', urgente: true })
  assert.deepEqual(textoLimite('2026-11-06', '2026-11-06'), { texto: 'Vence hoy', urgente: true })
  assert.deepEqual(textoLimite('2026-11-16', '2026-11-06'), { texto: 'Vence en 10 días', urgente: false })
})
