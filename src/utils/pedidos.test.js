// node --test src/utils/pedidos.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { PEDIDO_VACIO, datosParaGuardar, errorPedido, faltanDatosFiscales, ordenarPedidosParaCliente, pedidoAFormulario } from './pedidos.js'

const base = { ...PEDIDO_VACIO, cliente: 'Colegio' }

test('cliente obligatorio; anticipo pide quién lo recibió', () => {
  assert.equal(errorPedido({ ...PEDIDO_VACIO }), 'Falta el cliente del pedido.')
  assert.equal(errorPedido(base), null)
  assert.match(errorPedido({ ...base, anticipo: '500' }), /quién recibió/)
  assert.equal(errorPedido({ ...base, anticipo: '500', anticipoRecibidoPor: 'Ana' }), null)
})

test('factura: razón social obligatoria, lo demás solo avisa', () => {
  assert.match(errorPedido({ ...base, requiereFactura: true }), /razón social/)
  const f = { ...base, requiereFactura: true, razonSocial: 'Colegio SC' }
  assert.equal(errorPedido(f), null)
  assert.deepEqual(faltanDatosFiscales(f), ['RFC', 'régimen fiscal', 'código postal', 'uso de CFDI'])
  assert.deepEqual(faltanDatosFiscales({ ...f, rfc: 'X', regimenFiscal: '601', codigoPostal: '27000', usoCfdi: 'G03' }), [])
  assert.deepEqual(faltanDatosFiscales({ ...f, requiereFactura: false }), [])
})

test('mostrador: no manda anticipo ni factura (aunque estén capturados)', () => {
  const d = datosParaGuardar({ ...base, esMostrador: true, anticipo: '300', anticipoRecibidoPor: 'Ana', requiereFactura: true, razonSocial: 'X' })
  assert.equal(d.anticipo, 0)
  assert.equal(d.requiere_factura, false)
  assert.equal(d.anticipo_metodo_pago, null)
  assert.equal(errorPedido({ ...base, esMostrador: true, requiereFactura: true }), null)
})

test('ida y vuelta fila ↔ formulario', () => {
  const fila = { cliente: 'Colegio', client_id: 'c1', es_mostrador: false, anticipo: '1000.00', anticipo_metodo_pago: 'tarjeta', anticipo_recibido_por: 'Ana', requiere_factura: true, razon_social: 'Colegio SC', rfc: 'abc', regimen_fiscal: null, uso_cfdi: null, codigo_postal: '27000', direccion: null, notas: null }
  const d = datosParaGuardar(pedidoAFormulario(fila))
  assert.equal(d.anticipo, 1000)
  assert.equal(d.anticipo_metodo_pago, 'tarjeta')
  assert.equal(d.rfc, 'ABC')
  assert.equal(d.client_id, 'c1')
  assert.equal(d.codigo_postal, '27000')
})

test('pedidos del mismo cliente primero', () => {
  const lista = [{ id: 1, cliente: 'Otro' }, { id: 2, cliente: 'colegio ' }, { id: 3, cliente: 'X', client_id: 'c9' }]
  assert.deepEqual(ordenarPedidosParaCliente(lista, { cliente: 'Colegio' }).map((p) => p.id), [2, 1, 3])
  assert.deepEqual(ordenarPedidosParaCliente(lista, { clientId: 'c9' }).map((p) => p.id), [3, 1, 2])
})
