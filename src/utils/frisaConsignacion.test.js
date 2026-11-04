import test from 'node:test'
import assert from 'node:assert/strict'
import {
  quincenaDe, quincenasHasta, calcularStock, consumoSemanalPorProducto, nivelSku, redondearArriba10,
  filasSemaforo, revisarEntrega, lineasEntrega, facturacionPorQuincena, generarDatosPrueba, MODELOS_PRUEBA, sumarDias,
  agruparPorModelo, ordenarProductos, revisarArmado, sugerirProducto, sugerirPlanta, textoAlias,
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

test('datos de prueba: 5 plantas, 10 modelos con tallas, 1 rojo y 2 amarillos, OCs en todos los pasos', () => {
  for (let h = '2026-11-01'; h <= '2026-12-31'; h = sumarDias(h, 3)) {
    const d = generarDatosPrueba(h)
    assert.equal(d.plantas.length, 5)
    assert.equal(d.productos.length, 38)
    assert.equal(new Set(d.productos.map((p) => p.modelo)).size, 10)
    const productos = d.productos.map((p) => ({ ...p, id: p.sku }))
    const movs = d.movimientos.map((m) => ({ ...m, producto_id: m.sku, planta_id: m.planta }))
    const g = agruparPorModelo(productos, movs)
    const { filas } = filasSemaforo(g.productos, g.movimientos)
    const cuenta = (c) => filas.filter((f) => f.color === c).length
    assert.equal(cuenta('rojo'), 1, h)
    assert.equal(cuenta('amarillo'), 2, h)
    for (const m of MODELOS_PRUEBA) assert.equal(filas.find((f) => f.producto.sku === m.modelo).color, m.nivel, h + ' ' + m.modelo)
    const s = calcularStock(movs)
    assert.ok(Object.values(s.bodega).every((n) => n >= 0))
    assert.ok(Object.values(s.plantas).every((pl) => Object.values(pl).every((n) => n >= 0)))
    // cada entrega es de una OC entregada de esa planta, y la OC suma lo mismo
    const oc = Object.fromEntries(d.ordenes_compra.map((o) => [o.numero, o]))
    for (const m of movs.filter((x) => x.tipo === 'entrega')) {
      assert.equal(oc[m.oc]?.estado, 'entregada')
      assert.equal(oc[m.oc].planta, m.planta)
    }
    const estados = new Set(d.ordenes_compra.map((o) => o.estado))
    for (const e of ['recibida', 'en_taller', 'lista', 'armada', 'entregada']) assert.ok(estados.has(e), h + ' falta ' + e)
    assert.ok(d.ordenes_compra.some((o) => o.estado === 'recibida' && o.fecha_limite < h), 'una vencida')
    // la OC armada cabe en la bodega
    const armada = d.ordenes_compra.find((o) => o.estado === 'armada')
    for (const l of armada.lineas) assert.ok(l.cantidad <= s.bodega[l.sku], l.sku)
    assert.equal(new Set(movs.filter((m) => m.tipo === 'ajuste_confirmacion').map((m) => m.fecha)).size, 1)
    assert.ok(movs.every((m) => m.fecha < h))
  }
})

test('modelo/talla: agrupar suma tallas y máximos; orden de tallas', () => {
  const productos = [{ id: 'a', sku: 'X-M', modelo: 'X', talla: 'M' }, { id: 'b', sku: 'X-L', modelo: 'X', talla: 'L' }, { id: 'c', sku: 'Y-32', modelo: 'Y', talla: '32' }]
  const g = agruparPorModelo(productos, [M('2026-10-01', 'produccion', 'a', null, 5), M('2026-10-01', 'produccion', 'b', null, 7)], [{ planta_id: 'P', producto_id: 'a', maximo: 3 }, { planta_id: 'P', producto_id: 'b', maximo: 4 }])
  assert.equal(calcularStock(g.movimientos).bodega['m:X'], 12)
  assert.equal(g.maximos[0].maximo, 7)
  assert.equal(g.productos.find((p) => p.sku === 'X').nombre, 'M, L')
  assert.deepEqual(ordenarProductos([{ sku: '2', modelo: 'A', talla: 'XL' }, { sku: '1', modelo: 'A', talla: 'S' }, { sku: '3', modelo: 'A', talla: '2XL' }]).map((p) => p.talla), ['S', 'XL', '2XL'])
})

test('armar: descuenta lo apartado por otras OCs armadas', () => {
  const stock = calcularStock([M('2026-10-01', 'produccion', 'a', null, 10)])
  const ordenes = [{ id: 'o1', estado: 'armada' }, { id: 'o2', estado: 'lista' }]
  const lineas = [{ oc_id: 'o1', producto_id: 'a', cantidad: 6 }, { oc_id: 'o2', producto_id: 'a', cantidad: 5 }]
  const r = revisarArmado(ordenes[1], [lineas[1]], stock, ordenes, lineas)
  assert.equal(r.completa, false)
  assert.equal(r.filas[0].disponible, 4)
  assert.equal(r.filas[0].falta, 1)
  assert.equal(revisarArmado(ordenes[0], [lineas[0]], stock, ordenes, lineas).completa, true) // la propia no se descuenta
})

test('sugerir SKU y planta desde el PDF', () => {
  const productos = [
    { id: 'pm', sku: 'PRB-PLA-MC-M', modelo: 'Playera reflejante M/C (prueba)', talla: 'M' },
    { id: 'pl', sku: 'PRB-PLA-MC-L', modelo: 'Playera reflejante M/C (prueba)', talla: 'L' },
    { id: 'cm', sku: 'PRB-CAM-MZ-M', modelo: 'Camisa mezclilla (prueba)', talla: 'M' },
  ]
  assert.deepEqual(sugerirProducto('CAMISA DE MEZCLILLA 7 OZ', 'M', productos), { producto_id: 'cm', como: 'parecido' })
  assert.equal(sugerirProducto('PLAYERA C/R M/C REFLEJANTE', 'L', productos).producto_id, 'pl')
  const alias = [{ texto: textoAlias('PLAYERA  rara', 'm'), producto_id: 'pm' }]
  assert.deepEqual(sugerirProducto('playera rara', 'M', productos, alias), { producto_id: 'pm', como: 'aprendido' })
  assert.equal(sugerirProducto('ALGO QUE NO EXISTE', 'M', productos).producto_id, null)
  assert.equal(sugerirPlanta('FRISA ACERIA', [{ id: 1, nombre: 'Frisa Acería' }, { id: 2, nombre: 'Frisa Aerospace' }]), 1)
  assert.equal(sugerirPlanta('PLANTA NORTE (PRUEBA)', [{ id: 1, nombre: 'Planta Norte (prueba)' }, { id: 2, nombre: 'Planta Sur (prueba)' }]), 1)
})
