// node --test src/utils/buscarPorNombre.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { coincideNombre } from './buscarPorNombre.js'

test('sin acentos, sin mayúsculas, por palabras en cualquier orden', () => {
  assert.equal(coincideNombre('jose', 'Colegio José Martí'), true)
  assert.equal(coincideNombre('MARTI col', 'Colegio José Martí'), true)
  assert.equal(coincideNombre('pol azul', 'Polo Azul Marino'), true)
  assert.equal(coincideNombre('pol rojo', 'Polo Azul Marino'), false)
})

test('vacío coincide con todo; busca en varios campos', () => {
  assert.equal(coincideNombre('  ', 'Lo que sea'), true)
  assert.equal(coincideNombre('fr-pla', 'Playera', 'FR-PLA-AM-MC'), true)
  assert.equal(coincideNombre('x', null, undefined), false)
})
