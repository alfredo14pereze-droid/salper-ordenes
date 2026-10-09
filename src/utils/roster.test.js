// node --test src/utils/roster.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { rosterDePrenda, textoRoster } from './roster.js'

const roster = [
  { talla: 'L', nombre: ' LUIZ B. ', numero: '23' },
  { talla: 'M', nombre: '', numero: '' },
  { talla: 'XL', nombre: 'EDWIN G.', numero: '04' },
  { talla: 'M', nombre: '', numero: '7' },
]

test('solo las filas con nombre o número, y solo si la prenda lleva lista', () => {
  assert.equal(rosterDePrenda({ tiene_roster: true, roster }).length, 3)
  assert.deepEqual(rosterDePrenda({ tiene_roster: false, roster }), [])
  assert.deepEqual(rosterDePrenda({}), [])
})

test('texto para copiar: lista con tabuladores, o una sola columna', () => {
  const filas = rosterDePrenda({ tiene_roster: true, roster })
  assert.equal(textoRoster(filas), 'LUIZ B.\tL\t23\nEDWIN G.\tXL\t04\n\tM\t7')
  assert.equal(textoRoster(filas, 'nombres'), 'LUIZ B.\nEDWIN G.\n')
  assert.equal(textoRoster(filas, 'numeros'), '23\n04\n7')
  assert.equal(textoRoster([]), '')
})
