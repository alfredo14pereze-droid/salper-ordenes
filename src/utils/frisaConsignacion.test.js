import test from 'node:test'
import assert from 'node:assert/strict'
import {
  quincenaDe, quincenasHasta, calcularStock, consumoSemanalPorProducto, nivelSku, redondearArriba10,
  filasSemaforo, revisarEntrega, lineasEntrega, facturacionPorQuincena, generarDatosPrueba, PRODUCTOS_PRUEBA, sumarDias,
} from './frisaConsignacion.js'

test('quincenas: 1–15 y 16–fin de mes', () => {
  assert.deepEqual(quincenaDe('2026-11-04'), { inicio: '2026-11-01', fin: '2026-11-15', clave: '2026-11-A', etiqueta: '1–15 nov 2026' })
  assert.equal(quincenaDe('2026-02-20').fin, '2026-02-28')
  assert.equal(quincenaDe('2028-02-16').fin, '2028-02-29')
  assert.deepEqual(quincenasHasta('2026-11-04', 3).map((q) => q.clave), ['2026-11-A', '2026-10-B', '2026-10-A'])
})

const M = (fecha, tipo, producto_id, planta_id, cantidad) => ({ fecha, tipo, producto_id, planta_id, cantidad })

test('stock: bodega y plantas salen de los movimientos', () => {
  const movs = [
    M('2026-10-01', 'produccion', 'A', null, 100),
    M('2026-10-02', 'entrega', 'A', 'P1', 60),
    M('2026-10-15', 'consumo', 'A', 'P1', 20),
    M('2026-10-31', 'ajuste_confirmacion', 'A', 'P1', -3),
  ]
  const s = calcularStock(movs)
  assert.equal(s.bodega.A, 40)
  assert.equal(s.plantas.P1.A, 37)
  assert.equal(calcularStock(movs, '2026-10-15').plantas.P1.A, 40)
})

test('consumo semanal: últimas 6 quincenas con consumo ÷ semanas', () => {
  const movs = []
  // 7 quincenas, 70 por quincena: la más vieja queda fuera.
  for (const q of quincenasHasta('2026-10-31', 7)) movs.push(M(q.fin, 'consumo', 'A', 'P1', 70))
  movs.push(M('2026-07-15', 'consumo', 'A', 'P1', 9999)) // fuera de la ventana
  const { porProducto, ventana } = consumoSemanalPorProducto(movs)
  assert.equal(ventana.quincenas.length, 6)
  // 1-ago a 31-oct = 92 días → 420 ÷ (92/7)
  assert.equal(ventana.quincenas.at(-1).inicio, '2026-08-01')
  assert.ok(Math.abs(porProducto.A - 420 / (92 / 7)) < 1e-9)
})

test('niveles: rojo (bodega < 20 días) manda sobre amarillo', () => {
  // cs 70/sem = 10/día → 20 días = 200
  assert.equal(nivelSku({ bodega: 199, total: 1000, consumoSemanal: 70 }).color, 'rojo')
  assert.equal(nivelSku({ bodega: 200, total: 279, consumoSemanal: 70 }).color, 'amarillo') // 3.99 sem
  assert.equal(nivelSku({ bodega: 200, total: 280, consumoSemanal: 70 }).color, 'verde') // 4 sem
  assert.equal(nivelSku({ bodega: 0, total: 0, consumoSemanal: 0 }).color, 'verde') // sin consumo
})

test('sugerido: 6 semanas − total, mínimo 0, múltiplos de 10 hacia arriba', () => {
  assert.equal(nivelSku({ bodega: 200, total: 279, consumoSemanal: 70 }).sugerido, 150) // 420 − 279 = 141 → 150
  assert.equal(nivelSku({ bodega: 500, total: 500, consumoSemanal: 70 }).sugerido, 0)
  assert.equal(redondearArriba10(140), 140)
  assert.equal(redondearArriba10(141), 150)
})

test('semáforo ordenado rojo → amarillo → verde', () => {
  // 10 por quincena × 6 = 60 en ~13 semanas → ~4.6/sem; 20 días ≈ 13; 4 semanas ≈ 18
  const productos = [{ id: 'V', sku: 'V' }, { id: 'R', sku: 'R' }, { id: 'Y', sku: 'Y' }]
  const bodegaFinal = { V: 200, R: 5, Y: 15 }
  const movs = []
  for (const id of ['V', 'R', 'Y']) {
    movs.push(M('2026-07-01', 'produccion', id, null, bodegaFinal[id] + 60), M('2026-07-02', 'entrega', id, 'P1', 60))
    for (const q of quincenasHasta('2026-10-31', 6)) movs.push(M(q.fin, 'consumo', id, 'P1', 10))
  }
  const { filas } = filasSemaforo(productos, movs)
  assert.deepEqual(filas.map((f) => [f.producto.sku, f.color]), [['R', 'rojo'], ['Y', 'amarillo'], ['V', 'verde']])
  assert.equal(filas[1].enPlantas, 0)
  assert.equal(filas[1].total, 15)
})

test('entrega: avisa si la bodega no alcanza y arma las líneas', () => {
  const stock = calcularStock([M('2026-10-01', 'produccion', 'A', null, 50), M('2026-10-01', 'produccion', 'B', null, 5)])
  const cant = { P1: { A: 30, B: 3 }, P2: { A: 20, B: '4' } }
  const r = revisarEntrega(cant, stock, [{ id: 'A', sku: 'A' }, { id: 'B', sku: 'B' }])
  assert.equal(r.completa, false)
  assert.deepEqual(r.faltantes.map((f) => [f.producto.sku, f.pedido, f.bodega, f.falta]), [['B', 7, 5, 2]])
  assert.equal(lineasEntrega({ P1: { A: 0, B: '2' } }).length, 1)
})

test('facturación: cantidad × precio por planta y quincena', () => {
  const f = facturacionPorQuincena(
    [M('2026-10-15', 'consumo', 'A', 'P1', 10), M('2026-10-15', 'consumo', 'B', 'P1', 2), M('2026-10-31', 'consumo', 'A', 'P1', 1)],
    [{ id: 'A', precio_consumo: '100.50' }, { id: 'B', precio_consumo: 20 }],
    [{ id: 'P1', nombre: 'Norte' }],
  )
  assert.equal(f.length, 2)
  assert.equal(f[1].monto, 1045)
  assert.equal(f[1].piezas, 12)
})

test('datos de prueba: 5 plantas, 10 SKUs, 1 rojo y 2 amarillos, sin negativos', () => {
  for (let h = '2026-11-01'; h <= '2026-12-31'; h = sumarDias(h, 3)) {
    const d = generarDatosPrueba(h)
    assert.equal(d.plantas.length, 5)
    assert.equal(d.productos.length, 10)
    assert.equal(d.maximos.length, 50)
    const productos = d.productos.map((p) => ({ ...p, id: p.sku }))
    const movs = d.movimientos.map((m) => ({ ...m, producto_id: m.sku, planta_id: m.planta }))
    const { filas } = filasSemaforo(productos, movs)
    const cuenta = (c) => filas.filter((f) => f.color === c).length
    assert.equal(cuenta('rojo'), 1, h)
    assert.equal(cuenta('amarillo'), 2, h)
    for (const p of PRODUCTOS_PRUEBA) assert.equal(filas.find((f) => f.producto.sku === p.sku).color, p.nivel, h + ' ' + p.sku)
    const s = calcularStock(movs)
    assert.ok(Object.values(s.bodega).every((n) => n >= 0))
    assert.ok(Object.values(s.plantas).every((pl) => Object.values(pl).every((n) => n >= 0)))
    // entregas cada 10 días, una confirmación
    const fechasEntrega = [...new Set(movs.filter((m) => m.tipo === 'entrega').map((m) => m.fecha))].sort()
    for (let i = 1; i < fechasEntrega.length; i++) assert.equal(sumarDias(fechasEntrega[i - 1], 10), fechasEntrega[i])
    assert.equal(new Set(movs.filter((m) => m.tipo === 'ajuste_confirmacion').map((m) => m.fecha)).size, 1)
    assert.ok(movs.filter((m) => m.tipo === 'ajuste_confirmacion' && m.cantidad !== 0).length > 0)
    assert.ok(movs.every((m) => m.fecha < h))
  }
})
