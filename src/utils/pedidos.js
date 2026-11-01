// V176 — Pedidos: lógica sin pantalla (mismas reglas que pedido_validar_datos
// en supabase/schema_v176_pedidos.sql, para avisar antes de mandar).

export const PEDIDO_VACIO = {
  cliente: '',
  clientId: '',
  esMostrador: false,
  anticipo: '',
  anticipoMetodo: 'efectivo',
  anticipoRecibidoPor: '',
  requiereFactura: false,
  razonSocial: '',
  rfc: '',
  regimenFiscal: '',
  usoCfdi: '',
  codigoPostal: '',
  direccion: '',
  notas: '',
}

// Cómo entra la orden nueva: suelta, en un pedido nuevo o en uno que ya existe.
export const AGRUPACIONES = [
  { key: 'suelta', label: 'Orden suelta' },
  { key: 'nuevo', label: 'Nuevo pedido' },
  { key: 'existente', label: 'Agregar a pedido existente' },
]

function numero(v) {
  const n = Number(v)
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : 0
}

// Fila de `pedidos` → formulario.
export function pedidoAFormulario(p) {
  if (!p) return { ...PEDIDO_VACIO }
  return {
    cliente: p.cliente || '',
    clientId: p.client_id || '',
    esMostrador: !!p.es_mostrador,
    anticipo: Number(p.anticipo) > 0 ? String(Number(p.anticipo)) : '',
    anticipoMetodo: p.anticipo_metodo_pago || 'efectivo',
    anticipoRecibidoPor: p.anticipo_recibido_por || '',
    requiereFactura: !!p.requiere_factura,
    razonSocial: p.razon_social || '',
    rfc: p.rfc || '',
    regimenFiscal: p.regimen_fiscal || '',
    usoCfdi: p.uso_cfdi || '',
    codigoPostal: p.codigo_postal || '',
    direccion: p.direccion || '',
    notas: p.notas || '',
  }
}

// Formulario → p_datos de pedido_crear / pedido_actualizar. De mostrador no
// manda anticipo ni factura.
export function datosParaGuardar(f) {
  const most = !!f.esMostrador
  const anticipo = most ? 0 : numero(f.anticipo)
  const factura = !most && !!f.requiereFactura
  return {
    cliente: String(f.cliente || '').trim(),
    client_id: f.clientId || null,
    es_mostrador: most,
    anticipo,
    anticipo_metodo_pago: anticipo > 0 ? f.anticipoMetodo : null,
    anticipo_recibido_por: anticipo > 0 ? String(f.anticipoRecibidoPor || '').trim() : null,
    requiere_factura: factura,
    razon_social: factura ? String(f.razonSocial || '').trim() : String(f.razonSocial || '').trim() || null,
    rfc: String(f.rfc || '').trim().toUpperCase() || null,
    regimen_fiscal: f.regimenFiscal || null,
    uso_cfdi: f.usoCfdi || null,
    codigo_postal: String(f.codigoPostal || '').trim() || null,
    direccion: String(f.direccion || '').trim() || null,
    notas: String(f.notas || '').trim() || null,
  }
}

// Mensaje (o null) que bloquea guardar.
export function errorPedido(f) {
  if (!String(f.cliente || '').trim()) return 'Falta el cliente del pedido.'
  if (!f.esMostrador) {
    const a = String(f.anticipo ?? '').trim()
    if (a !== '' && !(Number(a) >= 0)) return 'El anticipo debe ser un número.'
    if (numero(a) > 0 && !String(f.anticipoRecibidoPor || '').trim()) return 'Falta indicar quién recibió el anticipo.'
    if (f.requiereFactura && !String(f.razonSocial || '').trim()) return 'Si el pedido requiere factura, la razón social es obligatoria.'
  }
  return null
}

// Aviso (no bloquea): con factura, qué datos fiscales faltan.
export function faltanDatosFiscales(f) {
  if (f.esMostrador || !f.requiereFactura) return []
  return [
    !String(f.rfc || '').trim() && 'RFC',
    !f.regimenFiscal && 'régimen fiscal',
    !String(f.codigoPostal || '').trim() && 'código postal',
    !f.usoCfdi && 'uso de CFDI',
  ].filter(Boolean)
}

// Pedidos que se ofrecen en "Agregar a pedido existente": primero los del
// mismo cliente (por id o por nombre).
export function ordenarPedidosParaCliente(pedidos, { clientId, cliente }) {
  const nombre = String(cliente || '').trim().toLowerCase()
  const esDelCliente = (p) => (clientId && p.client_id === clientId) || (nombre && String(p.cliente || '').trim().toLowerCase() === nombre)
  return [...(pedidos || [])].sort((a, b) => Number(esDelCliente(b)) - Number(esDelCliente(a)))
}
