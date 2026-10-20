// node --test src/utils/etapasOrden.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { etapasParaAgregar, resumenEtapas, sePuedeQuitar, validarEtapasOrden } from './etapasOrden.js'

const originales = [
  { etapa: 'corte', estado: 'pendiente' },
  { etapa: 'produccion', estado: 'en_proceso' },
  { etapa: 'terminado', estado: 'pendiente' },
]

test('solo se quitan las etapas que no han empezado', () => {
  assert.equal(sePuedeQuitar(originales[0]), true)
  assert.equal(sePuedeQuitar(originales[1]), false)
  assert.equal(sePuedeQuitar({ etapa: 'bordado' }), true) // recién agregada
  assert.equal(validarEtapasOrden([originales[1], originales[2]], originales), null) // quitar corte
  assert.equal(validarEtapasOrden([originales[0], originales[2]], originales), 'No se puede quitar Costura: ya se empezó.')
  assert.equal(validarEtapasOrden([], originales), 'La orden necesita al menos una etapa.')
})

test('agregar solo ofrece lo que no tiene y el resumen va en orden', () => {
  const keys = etapasParaAgregar(originales).map((o) => o.key)
  assert.ok(!keys.includes('corte') && keys.includes('bordado') && keys.includes('descosido'))
  assert.equal(resumenEtapas([originales[2], { etapa: 'impresion_prenda' }]), 'Terminado → Impresión (prenda)')
})
