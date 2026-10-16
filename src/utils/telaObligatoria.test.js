// node --test src/utils/telaObligatoria.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { faltaTela, tipoLlevaCorte } from './telaObligatoria.js'

const plantillas = [
  { order_type_key: 'escolar', etapa: 'corte' },
  { order_type_key: 'escolar', etapa: 'terminado' },
  { order_type_key: 'bordado', etapa: 'bordado' },
  { order_type_key: 'maquila', etapa: 'corte' },
]

test('qué tipos piden tela', () => {
  assert.equal(tipoLlevaCorte('escolar', plantillas), true)
  assert.equal(tipoLlevaCorte('bordado', plantillas), false)
  assert.equal(tipoLlevaCorte('maquila', plantillas), false)
  assert.equal(tipoLlevaCorte('nuevo_sin_corte', plantillas), false)
  assert.equal(tipoLlevaCorte('', plantillas), false)
})

test('cada prenda con contenido necesita tela; las vacías no cuentan', () => {
  assert.equal(faltaTela([{ garment: 'Polo', tela_id: 't1' }, { garment: '', sizes: [{ talla: '' }] }]), null)
  assert.match(faltaTela([{ garment: 'Polo', tela_id: 't1' }, { garment: 'Short', tela_id: '' }]), /^Short: falta elegir la tela/)
  assert.match(faltaTela([{ garment: '', sizes: [{ talla: 'M', cantidad: 3 }] }]), /^Prenda 1: falta/)
  assert.equal(faltaTela([]), null)
})
