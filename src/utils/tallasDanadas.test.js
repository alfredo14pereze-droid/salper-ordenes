// node --test src/utils/tallasDanadas.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { contarTallasDanadas } from './tallasDanadas.js'

test('cuenta tallas y prendas vacías', () => {
  assert.equal(contarTallasDanadas([{ sizes: [null, { talla: 'M' }, null] }, null, { sizes: [{ talla: 'L' }] }]), 3)
  assert.equal(contarTallasDanadas([{ sizes: [{ talla: 'M' }] }, { garment: 'sin tallas' }]), 0)
  assert.equal(contarTallasDanadas(null), 0)
})
