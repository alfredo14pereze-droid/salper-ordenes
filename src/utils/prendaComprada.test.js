// node --test src/utils/prendaComprada.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { cambioDePrenda, esComprada, marcarComprada, prendasParaCorte, puedeSerComprada, todoComprado } from './prendaComprada.js'
import { faltaTela } from './telaObligatoria.js'

test('solo playeras ofrecen el botón', () => {
  assert.equal(puedeSerComprada('Playera'), true)
  assert.equal(puedeSerComprada('playera dry fit'), true)
  assert.equal(puedeSerComprada('Short'), false)
  assert.equal(puedeSerComprada(''), false)
})

test('por defecto fabricada; comprada quita la tela', () => {
  assert.equal(esComprada({ garment: 'Playera' }), false)
  assert.deepEqual(marcarComprada(true), { comprada: true, tela_id: '', tela_nombre: '' })
  assert.deepEqual(marcarComprada(false), { comprada: false })
})

test('si deja de ser playera, deja de ser comprada', () => {
  assert.deepEqual(cambioDePrenda({ comprada: true }, 'Short'), { garment: 'Short', comprada: false })
  assert.deepEqual(cambioDePrenda({ comprada: true }, 'Playera polo'), { garment: 'Playera polo' })
  assert.deepEqual(cambioDePrenda({}, 'Short'), { garment: 'Short' })
})

test('corte no ve las compradas; todo comprado', () => {
  const items = [
    { garment: 'Playera', comprada: true, sizes: [{ talla: 'M', cantidad: 3 }] },
    { garment: 'Short', tela_id: 't1', sizes: [{ talla: 'M', cantidad: 3 }] },
  ]
  assert.deepEqual(prendasParaCorte(items).map((x) => x.index), [1])
  assert.equal(todoComprado(items), false)
  assert.equal(todoComprado([items[0], { garment: '', sizes: [{ talla: '', cantidad: '' }] }]), true)
  assert.equal(todoComprado([]), false)
})

test('una playera comprada no pide tela', () => {
  assert.equal(faltaTela([{ garment: 'Playera', comprada: true, tela_id: '' }]), null)
  assert.match(faltaTela([{ garment: 'Playera', tela_id: '' }]), /falta elegir la tela/)
})
