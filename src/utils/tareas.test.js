// node --test src/utils/tareas.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { destinatariosDe, estadoDePersona, estadoGeneral, leAplica, resumenDePersona, resumenPorPersona, estadoParaMi, hoyLocal, meToca, ordenarTareas, textoDestino, vencida } from './tareas.js'

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
  // V166: a quien asigna no le toca "todo el personal", pero sí lo suyo.
  assert.equal(meToca(todos, { userId: 'a', role: 'admin_tienda', asigna: true }), false)
  assert.equal(meToca({ destino_tipo: 'persona', destino_id: 'a' }, { userId: 'a', role: 'admin_tienda', asigna: true }), true)
  assert.equal(meToca({ destino_tipo: 'rol', destino_rol: 'admin_tienda' }, { userId: 'a', role: 'admin_tienda', asigna: true }), true)
})

test('destinatariosDe: "todo el personal" no cuenta a los admins (en_todos = false)', () => {
  const conAdmin = [...gente, { id: 'a', nombre: 'Armando', rol: 'admin_tienda', en_todos: false }]
  assert.deepEqual(destinatariosDe(todos, conAdmin).map((d) => d.id), ['g', 'j', 'l'])
  assert.deepEqual(destinatariosDe({ destino_tipo: 'rol', destino_rol: 'admin_tienda' }, conAdmin).map((d) => d.id), ['a'])
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

// ---------------------------------------------------------------------------
// Filtro por persona

const P = {
  giss: { id: 'g', nombre: 'Giss', rol: 'ventas', alta_en: '2026-01-01T00:00:00Z' },
  jose: { id: 'j', nombre: 'Jose', rol: 'tienda', alta_en: '2026-01-01T00:00:00Z' },
  nuevo: { id: 'n', nombre: 'Nuevo', rol: 'tienda', alta_en: '2026-11-10T00:00:00Z' },
  admin: { id: 'a', nombre: 'Armando', rol: 'admin_tienda', en_todos: false },
}
const T = (id, extra) => ({ id, creado_en: '2026-11-01T00:00:00Z', modo: 'cada_quien', ...extra })
const directa = T('d', { destino_tipo: 'persona', destino_id: 'g', destino_nombre: 'Giss' })
const rolCada = T('rc', { destino_tipo: 'rol', destino_rol: 'tienda' })
const rolUno = T('ru', { destino_tipo: 'rol', destino_rol: 'tienda', modo: 'uno' })
const todosCada = T('tc', { destino_tipo: 'todos', fecha_limite: '2026-11-05' })
const todosUno = T('tu', { destino_tipo: 'todos', modo: 'uno' })
const comp = (tarea_id, usuario_id) => ({ tarea_id, usuario_id, nombre: usuario_id })

test('leAplica: directa, por rol, todo el personal (sin admins y solo si ya existía)', () => {
  assert.equal(leAplica(directa, P.giss), true)
  assert.equal(leAplica(directa, P.jose), false)
  assert.equal(leAplica(rolCada, P.jose), true)
  assert.equal(leAplica(rolCada, P.giss), false)
  assert.equal(leAplica(todosCada, P.giss), true)
  assert.equal(leAplica(todosCada, P.admin), false)
  assert.equal(leAplica(todosCada, P.nuevo), false) // se dio de alta después
  assert.equal(leAplica(rolCada, P.nuevo), true) // por rol sí le aplica
  assert.equal(leAplica(todosCada, { id: 'x', rol: 'ventas' }), true) // sin fecha de alta: cuenta
})

test('estadoDePersona: cada quien vs basta con uno', () => {
  assert.equal(estadoDePersona(directa, [], P.giss), 'pendiente')
  assert.equal(estadoDePersona(directa, [comp('d', 'g')], P.giss), 'hecha')
  assert.equal(estadoDePersona(directa, [], P.jose), null)
  // Cada quien: que otro la haga no la quita de pendientes.
  assert.equal(estadoDePersona(rolCada, [comp('rc', 'n')], P.jose), 'pendiente')
  assert.equal(estadoDePersona(rolCada, [comp('rc', 'j')], P.jose), 'hecha')
  // Basta con uno: si nadie, pendiente; si otro, no se muestra; si él, hecha.
  assert.equal(estadoDePersona(rolUno, [], P.jose), 'pendiente')
  assert.equal(estadoDePersona(rolUno, [comp('ru', 'n')], P.jose), null)
  assert.equal(estadoDePersona(rolUno, [comp('ru', 'j')], P.jose), 'hecha')
  assert.equal(estadoDePersona(todosUno, [comp('tu', 'g')], P.jose), null)
  assert.equal(estadoDePersona(todosUno, [comp('tu', 'g')], P.giss), 'hecha')
  assert.equal(estadoDePersona(todosCada, [], P.admin), null)
})

test('resumenDePersona y resumenPorPersona (vencidas primero)', () => {
  const tareas = [directa, rolCada, rolUno, todosCada, todosUno]
  const porTarea = new Map([
    ['d', [comp('d', 'g')]],
    ['ru', [comp('ru', 'n')]],
    ['tu', [comp('tu', 'g')]],
  ])
  const hoy = '2026-11-13'
  assert.deepEqual(resumenDePersona(tareas, porTarea, P.giss, hoy), { hechas: 2, pendientes: 1, vencidas: 1 })
  assert.deepEqual(resumenDePersona(tareas, porTarea, P.jose, hoy), { hechas: 0, pendientes: 2, vencidas: 1 })
  assert.deepEqual(resumenDePersona(tareas, porTarea, P.nuevo, hoy), { hechas: 1, pendientes: 1, vencidas: 0 })
  assert.deepEqual(resumenPorPersona(tareas, porTarea, [P.nuevo, P.giss, P.jose], hoy).map((r) => r.persona.id), ['j', 'g', 'n'])
})
