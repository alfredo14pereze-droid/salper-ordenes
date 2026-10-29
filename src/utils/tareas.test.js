// node --test src/utils/tareas.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { destinatariosDe, estadoGeneral, estadoParaMi, hoyLocal, meToca, ordenarTareas, textoDestino, vencida } from './tareas.js'

const gente = [
  { id: 'g', nombre: 'Giss', rol: 'tienda' },
  { id: 'j', nombre: 'Jose', rol: 'tienda' },
  { id: 'l', nombre: 'Laura', rol: 'ventas' },
]
const todos = { id: 't1', destino_tipo: 'todos', modo: 'cada_quien' }
const tiendaUno = { id: 't2', destino_tipo: 'rol', destino_rol: 'tienda', modo: 'uno' }
const aLaura = { id: 't3', destino_tipo: 'persona', destino_id: 'l', destino_nombre: 'Laura', modo: 'cada_quien' }

test('meToca: todos, por rol y por persona', () => {
  assert.equal(meToca(todos, { userId: 'g', role: 'tienda' }), true)
  assert.equal(meToca(tiendaUno, { userId: 'g', role: 'tienda' }), true)
  assert.equal(meToca(tiendaUno, { userId: 'l', role: 'ventas' }), false)
  assert.equal(meToca(aLaura, { userId: 'l', role: 'ventas' }), true)
  assert.equal(meToca(aLaura, { userId: 'g', role: 'tienda' }), false)
})

test('destinatariosDe', () => {
  assert.deepEqual(destinatariosDe(todos, gente).map((d) => d.id), ['g', 'j', 'l'])
  assert.deepEqual(destinatariosDe(tiendaUno, gente).map((d) => d.id), ['g', 'j'])
  assert.deepEqual(destinatariosDe(aLaura, gente).map((d) => d.id), ['l'])
  // Persona que ya no está en la lista (p. ej. suspendida): se usa el nombre guardado.
  assert.equal(destinatariosDe(aLaura, [])[0].nombre, 'Laura')
})

test('estadoParaMi: cada quien vs basta con uno', () => {
  const c = [{ usuario_id: 'g', nombre: 'Giss' }]
  assert.equal(estadoParaMi(todos, c, 'j').hecha, false)
  assert.equal(estadoParaMi(todos, c, 'g').hecha, true)
  const r = estadoParaMi(tiendaUno, c, 'j')
  assert.equal(r.hecha, true)
  assert.equal(r.porOtro.nombre, 'Giss')
  assert.equal(r.mia, null)
})

test('estadoGeneral: quiénes faltan y cuándo está completa', () => {
  const e = estadoGeneral(todos, [{ usuario_id: 'g' }], gente)
  assert.equal(e.hecha, false)
  assert.equal(e.total, 3)
  assert.deepEqual(e.faltan.map((d) => d.nombre), ['Jose', 'Laura'])
  assert.equal(estadoGeneral(todos, gente.map((g) => ({ usuario_id: g.id })), gente).hecha, true)
  assert.equal(estadoGeneral(tiendaUno, [{ usuario_id: 'j' }], gente).hecha, true)
  assert.equal(estadoGeneral(tiendaUno, [], gente).hecha, false)
  // Rol sin nadie: no se da por hecha.
  assert.equal(estadoGeneral({ destino_tipo: 'rol', destino_rol: 'contabilidad', modo: 'cada_quien' }, [], gente).hecha, false)
})

test('vencida y orden', () => {
  const hoy = '2026-10-29'
  assert.equal(vencida({ fecha_limite: '2026-10-28' }, false, hoy), true)
  assert.equal(vencida({ fecha_limite: '2026-10-29' }, false, hoy), false)
  assert.equal(vencida({ fecha_limite: '2026-10-28' }, true, hoy), false)
  assert.equal(vencida({ fecha_limite: null }, false, hoy), false)
  const orden = ordenarTareas([
    { id: 'sin', fecha_limite: null, creado_en: '2026-10-29T10:00' },
    { id: 'luego', fecha_limite: '2026-11-10', creado_en: '2026-10-20T10:00' },
    { id: 'vencida', fecha_limite: '2026-10-01', creado_en: '2026-10-01T10:00' },
    { id: 'pronto', fecha_limite: '2026-10-30', creado_en: '2026-10-25T10:00' },
  ], hoy).map((t) => t.id)
  assert.deepEqual(orden, ['vencida', 'pronto', 'luego', 'sin'])
  assert.match(hoyLocal(new Date(2026, 0, 5)), /^2026-01-05$/)
})

test('textoDestino', () => {
  assert.equal(textoDestino(todos), 'Para todo el personal')
  assert.equal(textoDestino(tiendaUno, { roleLabels: { tienda: 'Tienda' } }), 'Para Tienda')
  assert.equal(textoDestino(aLaura, { userId: 'l' }), 'Para ti')
  assert.equal(textoDestino(aLaura, { userId: 'g' }), 'Para Laura')
})
