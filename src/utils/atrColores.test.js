import test from 'node:test'
import assert from 'node:assert/strict'
import { colorHex, coloresDe, matrizInventario, textoSobre } from './atrColores.js'
import { TALLAS_ATR } from './atrCarga.js'

test('colores conocidos y texto legible', () => {
  assert.equal(colorHex('Azul Cielo'), '#8ecae6')
  assert.equal(colorHex('CAFÉ'), '#6f4e37')
  assert.equal(colorHex('Morado'), null)
  assert.equal(textoSobre('#ffffff'), '#1a1a1a')
  assert.equal(textoSobre('#141414'), '#ffffff')
  assert.deepEqual(coloresDe([{ color: 'Negra' }, { color: 'Azul Cielo' }, { color: 'negra' }]), ['Azul Cielo', 'Negra'])
})

test('matriz: todas las batas (aunque estén en 0), tallas en columnas', () => {
  const productos = [
    { id: 'b', nombre: 'Bata sin bolsa Blanca', color: 'Blanca', con_bolsa: false },
    { id: 'a', nombre: 'Bata con bolsa Azul Cielo', color: 'Azul Cielo', con_bolsa: true },
  ]
  const ex = [
    { producto_id: 'a', talla: 'S', existencia: 5 },
    { producto_id: 'a', talla: 'M', existencia: 4 },
    { producto_id: 'a', talla: 'L', existencia: 10 },
    { producto_id: 'a', talla: '5XL', existencia: 1 },
  ]
  const { filas, tallas } = matrizInventario(productos, ex, TALLAS_ATR)
  assert.deepEqual(tallas, ['S', 'M', 'L', 'XL', '2XL', '3XL', '5XL']) // XS y 4XL solo si traen algo
  assert.equal(filas[0].producto.id, 'a') // con bolsa primero
  assert.deepEqual(filas[0].porTalla, { S: 5, M: 4, L: 10, '5XL': 1 })
  assert.equal(filas[0].total, 20)
  assert.equal(filas[1].producto.id, 'b') // la blanca sale aunque no tenga nada
  assert.equal(filas[1].total, 0)
})
