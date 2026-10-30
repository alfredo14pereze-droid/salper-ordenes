// node --test src/utils/chofer.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { ordenesParaEntregar, pendientesPorLlevar, piezasDeOrden, tareasPendientes } from './chofer.js'

test('solo listas para entregar, sin canceladas, por fecha', () => {
  const r = ordenesParaEntregar([
    { id: 'a', status: 'terminado', requested_delivery_date: '2026-11-05' },
    { id: 'b', status: 'terminado', requested_delivery_date: '2026-11-01' },
    { id: 'c', status: 'terminado', cancelled_at: 'x' },
    { id: 'd', status: 'en_produccion' },
    { id: 'e', status: 'terminado', requested_delivery_date: null },
  ])
  assert.deepEqual(r.map((o) => o.id), ['b', 'a', 'e'])
})

test('piezas por prenda y total', () => {
  const r = piezasDeOrden({ items: [
    { garment: 'Playera', color: 'Azul', sizes: [{ talla: 'M', cantidad: 10 }, { talla: 'G', cantidad: 0 }, { talla: 'CH', cantidad: '5' }] },
    { garment: 'Short', sizes: [] },
  ] })
  assert.deepEqual(r, { lineas: [{ prenda: 'Playera', color: 'Azul', tallas: 'M 10 · CH 5', total: 15 }], total: 15 })
})

test('pendientes en camino a cada lado', () => {
  const r = pendientesPorLlevar([{ estado: 'enviado_a_fabrica' }, { estado: 'enviado_a_tienda' }, { estado: 'recibido_en_fabrica' }])
  assert.equal(r.aFabrica.length, 1)
  assert.equal(r.aTienda.length, 1)
})

test('tareas del chofer sin hacer', () => {
  const tareas = [
    { id: 1, destino_tipo: 'rol', destino_rol: 'chofer', modo: 'cada_quien', creado_en: '1' },
    { id: 2, destino_tipo: 'rol', destino_rol: 'ventas', modo: 'cada_quien', creado_en: '2' },
    { id: 3, destino_tipo: 'persona', destino_id: 'u1', modo: 'cada_quien', creado_en: '3' },
    { id: 4, destino_tipo: 'todos', modo: 'cada_quien', creado_en: '4' },
  ]
  const r = tareasPendientes(tareas, [{ tarea_id: 4, usuario_id: 'u1' }], { userId: 'u1', role: 'chofer' })
  assert.deepEqual(r.map((t) => t.id).sort(), [1, 3])
})
