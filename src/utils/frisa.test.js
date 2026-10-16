// node --test src/utils/frisa.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  admiteBordadoPorOrden,
  etiquetaSecuencia,
  expandirTallas,
  moverProceso,
  prendaFrisa,
  procesosDeLaOrdenFrisa,
  procesosParaGuardar,
  validarOrdenFrisa,
  validarProductoFrisa,
} from './frisa.js'
import { situacionEnEstacion } from './ordenesDeEstacion.js'
import { ESTACIONES, etapasDeEstacion } from '../config/vistasPorRol.js'

const pasos = (...lista) => lista.map((p, i) => (typeof p === 'string' ? { proceso: p, orden: i + 1 } : { ...p, orden: i + 1 }))
const playeraAM = { id: 'p1', codigo: 'FR-PLA-AM-MC', nombre: 'Playera C/REF A. Marino M/C', origen: 'comprada', tallas_rango: 'S-3XL', activo: true, procesos: pasos('descosido', 'reflejante', { proceso: 'impresion', impresiones: 1 }, 'terminado') }
const playeraVE = { ...playeraAM, codigo: 'FR-PLA-VE-MC', procesos: pasos('descosido', 'reflejante', { proceso: 'impresion', impresiones: 2 }, 'terminado') }
const camisaBas = { id: 'c1', codigo: 'FR-CAM-BAS', nombre: 'Camisa Frisa', origen: 'confeccionada', tallas_rango: 'S-3XL', activo: true, procesos: pasos('corte', 'costura', 'bordado', 'terminado') }
const camisaSinBordado = { ...camisaBas, procesos: pasos('corte', 'costura', 'terminado') }

// Etapas de una orden Frisa como las crea el servidor (orden_secuencia 1..n).
const etapasDe = (claves, estados = {}) => claves.map((etapa, i) => ({ etapa, orden_secuencia: i + 1, estado: estados[etapa] || 'pendiente' }))
const frisa = { order_type_key: 'frisa' }

test('tallas por rango', () => {
  assert.deepEqual(expandirTallas('S-3XL'), ['S', 'M', 'L', 'XL', '2XL', '3XL'])
  assert.deepEqual(expandirTallas('xs – xl'), ['XS', 'S', 'M', 'L', 'XL'])
  assert.deepEqual(expandirTallas('28-34'), ['28', '30', '32', '34'])
  assert.deepEqual(expandirTallas('S, M, L'), ['S', 'M', 'L'])
  assert.deepEqual(expandirTallas('Unitalla'), ['Unitalla'])
  assert.deepEqual(expandirTallas(''), [])
})

test('la secuencia se ve en orden, con impresiones', () => {
  assert.equal(etiquetaSecuencia(playeraAM.procesos), 'Descosido → Reflejante → Impresión ×1 → Terminado')
  assert.equal(etiquetaSecuencia(playeraVE.procesos), 'Descosido → Reflejante → Impresión ×2 → Terminado')
  assert.equal(etiquetaSecuencia([...camisaBas.procesos].reverse()), 'Corte → Costura → Bordado → Terminado')
})

test('bordado por orden: solo confeccionada sin bordado, antes de terminado', () => {
  assert.equal(admiteBordadoPorOrden(camisaBas), false) // ya lo trae: no se duplica
  assert.equal(admiteBordadoPorOrden(playeraAM), false) // comprada
  assert.equal(admiteBordadoPorOrden(camisaSinBordado), true)
  assert.deepEqual(procesosDeLaOrdenFrisa(camisaSinBordado, true).map((p) => `${p.proceso}${p.orden}`), ['corte1', 'costura2', 'bordado3', 'terminado4'])
  assert.deepEqual(procesosDeLaOrdenFrisa(camisaBas, true).map((p) => p.proceso), ['corte', 'costura', 'bordado', 'terminado'])
  assert.deepEqual(procesosDeLaOrdenFrisa(playeraAM, true).map((p) => p.proceso), ['descosido', 'reflejante', 'impresion', 'terminado'])
})

test('la prenda lleva las cantidades en el orden del rango', () => {
  const p = prendaFrisa(playeraAM, { '3XL': '2', M: '10', S: '', L: '0' })
  assert.equal(p.garment, 'Playera C/REF A. Marino M/C')
  assert.equal(p.producto_frisa_id, 'p1')
  assert.deepEqual(p.sizes, [{ talla: 'M', cantidad: 10 }, { talla: '3XL', cantidad: 2 }])
  assert.equal(validarOrdenFrisa({ producto: playeraAM, cantidades: {} }), 'Captura al menos una talla con su cantidad.')
  assert.equal(validarOrdenFrisa({ producto: null, cantidades: {} }), 'Elige el producto de Frisa.')
  assert.equal(validarOrdenFrisa({ producto: { ...playeraAM, activo: false }, cantidades: { M: 1 } }), 'El producto FR-PLA-AM-MC está dado de baja.')
  assert.equal(validarOrdenFrisa({ producto: playeraAM, cantidades: { M: 1 } }), null)
})

test('catálogo: validar y ordenar la secuencia', () => {
  const base = { codigo: 'FR-X', nombre: 'X', origen: 'comprada' }
  assert.equal(validarProductoFrisa({ ...base, procesos: [] }), 'Agrega al menos un proceso.')
  assert.equal(validarProductoFrisa({ ...base, procesos: [{ proceso: 'terminado' }, { proceso: 'terminado' }] }), '"Terminado" está dos veces en la secuencia.')
  assert.equal(validarProductoFrisa({ ...base, origen: '', procesos: [{ proceso: 'terminado' }] }), 'Elige si es confeccionada o comprada.')
  assert.equal(validarProductoFrisa({ ...base, procesos: [{ proceso: 'impresion', impresiones: '0' }] }), 'El número de impresiones debe ser 1 o más.')
  assert.equal(validarProductoFrisa({ ...base, procesos: [{ proceso: 'impresion', impresiones: '2' }, { proceso: 'terminado' }] }), null)
  assert.deepEqual(moverProceso(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b'])
  assert.deepEqual(moverProceso(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c'])
  assert.deepEqual(procesosParaGuardar([{ proceso: 'corte', impresiones: '3', notas: ' ' }, { proceso: 'impresion', impresiones: '2', notas: 'Frente' }]), [
    { proceso: 'corte', impresiones: null, notas: null },
    { proceso: 'impresion', impresiones: 2, notas: 'Frente' },
  ])
})

test('prueba 1 — FR-PLA-AM-MC: solo descosido, reflejante, impresión y terminado; terminado espera a impresión', () => {
  const claves = ['descosido', 'reflejante', 'impresion_prenda', 'terminado']
  // No hay etapa de costura en esta orden: solo descosido (terminado) arranca.
  assert.equal(situacionEnEstacion('produccion', etapasDe(claves), frisa), null)
  assert.equal(situacionEnEstacion('corte', etapasDe(claves), frisa), null)
  assert.equal(situacionEnEstacion('descosido', etapasDe(claves), frisa), 'lista')
  assert.equal(situacionEnEstacion('reflejante', etapasDe(claves), frisa), 'espera')
  assert.equal(situacionEnEstacion('impresion_prenda', etapasDe(claves), frisa), 'espera')
  assert.equal(situacionEnEstacion('terminado', etapasDe(claves), frisa), 'espera')
  const conImpresionEnProceso = etapasDe(claves, { descosido: 'completado', reflejante: 'completado', impresion_prenda: 'en_proceso' })
  assert.equal(situacionEnEstacion('terminado', conImpresionEnProceso, frisa), 'espera')
  const conImpresionLista = etapasDe(claves, { descosido: 'completado', reflejante: 'completado', impresion_prenda: 'completado' })
  assert.equal(situacionEnEstacion('terminado', conImpresionLista, frisa), 'lista')
})

test('prueba 2 — FR-CAM-BAS: corte primero; costura no aparece hasta que corte esté completado', () => {
  const claves = ['corte', 'produccion', 'bordado', 'terminado']
  assert.equal(situacionEnEstacion('corte', etapasDe(claves), frisa), 'lista')
  assert.equal(situacionEnEstacion('produccion', etapasDe(claves, { corte: 'en_proceso' }), frisa), 'espera')
  assert.equal(situacionEnEstacion('produccion', etapasDe(claves, { corte: 'completado' }), frisa), 'lista')
  // Estricta: bordado espera a costura (no a corte, como en los demás tipos).
  assert.equal(situacionEnEstacion('bordado', etapasDe(claves, { corte: 'completado' }), frisa), 'espera')
  // Y terminado espera a que bordado TERMINE (en los demás tipos basta con que empiece).
  assert.equal(situacionEnEstacion('terminado', etapasDe(claves, { corte: 'completado', produccion: 'completado', bordado: 'en_proceso' }), frisa), 'espera')
  // Los demás tipos no cambian.
  assert.equal(situacionEnEstacion('terminado', etapasDe(claves, { corte: 'completado', produccion: 'en_proceso' }), { order_type_key: 'escolar' }), 'lista')
})

test('prueba 3 — FR-PLA-VE-MC: impresiones = 2 en la secuencia de la orden', () => {
  const imp = procesosDeLaOrdenFrisa(playeraVE).find((p) => p.proceso === 'impresion')
  assert.equal(imp.impresiones, 2)
  assert.match(etiquetaSecuencia(procesosDeLaOrdenFrisa(playeraVE)), /Impresión ×2/)
})

// (canChangeEtapa vive en permissions.js, que no se puede importar desde node.)
test('reflejante sale en costura; descosido e impresión en terminado', () => {
  assert.deepEqual(etapasDeEstacion(ESTACIONES.costura), ['reflejante', 'produccion'])
  assert.deepEqual(etapasDeEstacion(ESTACIONES.terminado), ['descosido', 'impresion_prenda', 'terminado'])
})
