// node --test src/utils/maquila.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { etiquetaProcesos, fotosDeProducto, ordenarProcesos, prendaMaquila, procesosDeLaOrden, validarOrdenMaquila } from './maquila.js'
import { filtrarClientesPorTipo } from './clientes.js'
import { situacionEnEstacion } from './ordenesDeEstacion.js'

const etapas = (procesos) => procesos.map((etapa) => ({ etapa, estado: 'pendiente' }))

test('los procesos salen sin repetidos y en el orden del flujo', () => {
  assert.deepEqual(ordenarProcesos(['terminado', 'produccion', 'terminado', 'otro']), ['produccion', 'terminado'])
  assert.equal(etiquetaProcesos(['terminado', 'corte', 'produccion']), 'Corte → Costura → Terminado')
})

test('la orden lleva los procesos del producto, más bordado si se marcó', () => {
  const producto = { nombre: 'Polo', procesos: ['produccion', 'terminado'] }
  assert.deepEqual(procesosDeLaOrden(producto, false), ['produccion', 'terminado'])
  assert.deepEqual(procesosDeLaOrden(producto, true), ['produccion', 'bordado', 'terminado'])
})

test('la prenda de maquila toma el nombre del producto y limpia las tallas', () => {
  const producto = { id: 'p1', nombre: 'Polo', procesos: ['bordado'] }
  const prenda = prendaMaquila({ id: 'i1', sizes: [{ talla: ' M ', cantidad: '10' }, { talla: '', cantidad: '' }, { talla: 'L', cantidad: '0' }] }, producto, false)
  assert.deepEqual(prenda, { id: 'i1', garment: 'Polo', producto_id: 'p1', lleva_bordado: true, sizes: [{ talla: 'M', cantidad: 10 }] })
})

test('validación: cliente, producto, corte, tallas y procesos', () => {
  const cliente = { id: 'c1', nombre: 'Externo' }
  const producto = { id: 'p1', nombre: 'Polo', procesos: ['produccion'] }
  const item = { sizes: [{ talla: 'M', cantidad: '5' }] }
  assert.match(validarOrdenMaquila({}), /cliente/)
  assert.match(validarOrdenMaquila({ cliente }), /producto/)
  assert.match(validarOrdenMaquila({ cliente, producto, numeroCorte: '  ' }), /número de corte/)
  assert.match(validarOrdenMaquila({ cliente, producto, numeroCorte: 'A1', item: { sizes: [] } }), /talla/)
  assert.match(validarOrdenMaquila({ cliente, producto: { ...producto, procesos: [] }, numeroCorte: 'A1', item }), /procesos/)
  assert.equal(validarOrdenMaquila({ cliente, producto: { ...producto, procesos: [] }, numeroCorte: 'A1', item, llevaBordado: true }), null)
  assert.equal(validarOrdenMaquila({ cliente, producto, numeroCorte: 'A1', item }), null)
})

test('en Maquila solo salen los clientes marcados como de maquila', () => {
  const clientes = [{ id: 1, tipo_orden: [] }, { id: 2, tipo_orden: ['escolar'] }, { id: 3, tipo_orden: ['maquila', 'industrial'] }]
  assert.deepEqual(filtrarClientesPorTipo(clientes, 'maquila').map((c) => c.id), [3])
  assert.deepEqual(filtrarClientesPorTipo(clientes, 'escolar').map((c) => c.id), [1, 2])
})

test('estaciones: una etapa previa que la orden no tiene cuenta como cumplida', () => {
  // Costura + terminado, sin corte: costura la ve de inmediato.
  const sinCorte = etapas(['produccion', 'terminado'])
  assert.equal(situacionEnEstacion('produccion', sinCorte), 'lista')
  assert.equal(situacionEnEstacion('corte', sinCorte), null)
  // Bordado solo ve órdenes con la etapa de bordado.
  assert.equal(situacionEnEstacion('bordado', sinCorte), null)
  assert.equal(situacionEnEstacion('bordado', etapas(['produccion', 'bordado', 'terminado'])), 'lista')
  // Terminado sigue esperando a que costura empiece.
  assert.equal(situacionEnEstacion('terminado', sinCorte), 'espera')
  assert.equal(situacionEnEstacion('terminado', [{ etapa: 'produccion', estado: 'en_proceso' }, { etapa: 'terminado', estado: 'pendiente' }]), 'lista')
  // Solo terminado: no espera a nadie.
  assert.equal(situacionEnEstacion('terminado', etapas(['terminado'])), 'lista')
  // Con corte, costura sí espera.
  assert.equal(situacionEnEstacion('produccion', etapas(['corte', 'produccion'])), 'espera')
})

test('fotos del producto que se copian a la orden', () => {
  assert.deepEqual(fotosDeProducto({ nombre: 'Blusa', fotos: [{ url: 'u1', path: 'productos/c/1.jpg' }, { url: 'u2' }] }), [{ url: 'u1', path: 'productos/c/1.jpg', name: 'Blusa' }])
  assert.deepEqual(fotosDeProducto({ nombre: 'Vieja', fotos: [], foto_url: 'u', foto_path: 'p.jpg' }), [{ url: 'u', path: 'p.jpg', name: 'Vieja' }])
  assert.deepEqual(fotosDeProducto({ nombre: 'Sin foto' }), [])
  assert.deepEqual(fotosDeProducto(null), [])
})
