import { useMemo } from 'react'
import { CLIENTE_OTRO, filtrarClientesPorTipo } from '../../utils/clientes'

// Selector de cliente de "Nueva orden" (V60 — reescrito).
//
// - Solo ofrece los clientes del CATÁLOGO que corresponden al tipo de orden
//   elegido (un cliente puede ser de varios tipos — ver filtrarClientesPorTipo).
//   Hasta que se elige el tipo de orden, no hay nada que elegir.
// - Ya NO se da de alta un cliente desde aquí (antes había "+ Cliente nuevo"
//   con su propio formulario). Un cliente que se va a repetir se agrega en
//   Catálogos; aquí, si no está registrado, se usa "Otro cliente (no
//   registrado)": se capturan nombre, teléfono y correo SOLO para esta
//   orden y NO se guarda nada en el catálogo (son clientes incidentales
//   que no se quiere registrar por un solo pedido). En la orden queda el
//   nombre/teléfono/correo, sin `client_id`.
export default function ClienteSelect({
  clientes,
  orderTypeKey,
  clientId,
  incidental,
  nombre,
  telefono,
  correo,
  onSelectCliente,
  onSelectIncidental,
  onField,
}) {
  const clientesFiltrados = useMemo(() => filtrarClientesPorTipo(clientes, orderTypeKey), [clientes, orderTypeKey])
  const seleccionado = clientesFiltrados.find((c) => c.id === clientId)

  function handleChange(e) {
    const v = e.target.value
    if (v === CLIENTE_OTRO) {
      onSelectIncidental()
      return
    }
    onSelectCliente(clientesFiltrados.find((c) => c.id === v) || null)
  }

  return (
    <div>
      <select
        className="input"
        value={incidental ? CLIENTE_OTRO : clientId || ''}
        onChange={handleChange}
        disabled={!orderTypeKey}
      >
        <option value="">{orderTypeKey ? 'Selecciona un cliente…' : 'Primero elige el tipo de orden'}</option>
        {clientesFiltrados.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
        <option value={CLIENTE_OTRO}>Otro cliente (no registrado)</option>
      </select>

      {seleccionado && (seleccionado.telefono || seleccionado.correo) && (
        <p className="pantone-hint" style={{ marginTop: 6 }}>
          {[seleccionado.telefono, seleccionado.correo].filter(Boolean).join(' · ')}
        </p>
      )}

      {incidental && (
        <div style={{ marginTop: 10 }}>
          <div className="form-row-3">
            <label>
              Nombre *
              <input
                type="text"
                className="input"
                value={nombre}
                onChange={(e) => onField('clientName', e.target.value)}
                autoFocus
              />
            </label>
            <label>
              Teléfono
              <input type="tel" className="input" value={telefono} onChange={(e) => onField('clientTelefono', e.target.value)} />
            </label>
            <label>
              Correo
              <input type="email" className="input" value={correo} onChange={(e) => onField('clientCorreo', e.target.value)} />
            </label>
          </div>
          <p className="pantone-hint" style={{ marginTop: 6 }}>
            Solo para esta orden — no se guarda en el catálogo.
          </p>
        </div>
      )}
    </div>
  )
}
