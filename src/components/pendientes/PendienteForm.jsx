import { useEffect, useState } from 'react'
import PhotoPicker from '../orders/PhotoPicker'
import { fetchClientes } from '../../services/clientesService'
import { fetchOrders } from '../../services/ordersService'
import { crearPendiente, editarPendiente, fetchTipos, uploadPendientePhoto } from '../../services/pendientesService'

const PRENDAS_COMUNES = ['Playera', 'Short', 'Chamarra', 'Sudadera', 'Pantalonera', 'Pantalón', 'Falda', 'Camisa', 'Suéter', 'Vestido', 'Otro']

function manana() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-CA')
}

// Alta y edición de un pendiente (modal). En edición solo se llega mientras
// fábrica no lo ha recibido (el servidor lo vuelve a validar).
export default function PendienteForm({ pendiente = null, onClose, onSaved }) {
  const editing = !!pendiente
  const [tipos, setTipos] = useState([])
  const [clientes, setClientes] = useState([])
  const [ordenes, setOrdenes] = useState([])
  const [descripcion, setDescripcion] = useState(pendiente?.descripcion || '')
  const [tipoId, setTipoId] = useState(pendiente?.tipo_id || '')
  const [cantidad, setCantidad] = useState(pendiente?.cantidad ?? 1)
  const [fecha, setFecha] = useState(pendiente?.fecha_requerida || manana())
  const [esCliente, setEsCliente] = useState(!!pendiente?.es_para_cliente)
  const [clienteNombre, setClienteNombre] = useState(pendiente?.cliente_nombre || '')
  const [clienteTel, setClienteTel] = useState(pendiente?.cliente_telefono || '')
  const [prenda, setPrenda] = useState(pendiente?.prenda || '')
  const [talla, setTalla] = useState(pendiente?.talla || '')
  const [orderId, setOrderId] = useState(pendiente?.order_id || '')
  const [fotosGuardadas, setFotosGuardadas] = useState(pendiente?.fotos || [])
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchTipos().then(({ data }) => setTipos(data || []))
    fetchClientes().then(({ data }) => setClientes(data || []))
    fetchOrders().then(({ data }) => setOrdenes((data || []).filter((o) => o.status !== 'completado' && !o.cancelled_at)))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const nuevas = []
    for (const file of files) {
      const { data, error: upErr } = await uploadPendientePhoto(file)
      if (upErr) {
        setSaving(false)
        setError(upErr)
        return
      }
      nuevas.push(data)
    }
    const payload = {
      descripcion: descripcion.trim(),
      tipoId,
      cantidad: Number(cantidad),
      fechaRequerida: fecha,
      // Si el nombre coincide con un cliente del catálogo, se liga (sirve para reportes);
      // si no, es un cliente incidental y solo se guarda el nombre.
      clienteId: esCliente ? clientes.find((c) => c.nombre.trim().toLowerCase() === clienteNombre.trim().toLowerCase())?.id || null : null,
      esParaCliente: esCliente,
      clienteNombre: clienteNombre.trim(),
      clienteTelefono: clienteTel.trim(),
      prenda: prenda.trim(),
      talla: talla.trim(),
      orderId,
      fotos: [...fotosGuardadas, ...nuevas],
    }
    const { data, error: saveErr } = editing ? await editarPendiente({ id: pendiente.id, ...payload }) : await crearPendiente(payload)
    setSaving(false)
    if (saveErr) {
      setError(saveErr)
      return
    }
    onSaved?.(data)
  }

  return (
    <div className="mt-modal-overlay" onClick={onClose}>
      <div className="mt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mt-modal__head">
          <h3>{editing ? `Editar ${pendiente.folio}` : 'Nuevo pendiente para fábrica'}</h3>
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <form onSubmit={handleSubmit} className="order-form">
          <label>
            ¿Qué hay que hacer? *
            <textarea className="input" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required autoFocus placeholder="Ej. Cambiar el broche de la chamarra azul" />
          </label>
          <div className="form-row">
            <label>
              Tipo de trabajo *
              <select className="input" value={tipoId} onChange={(e) => setTipoId(e.target.value)} required>
                <option value="">Selecciona…</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cantidad *
              <input type="number" min="1" className="input" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required inputMode="numeric" />
            </label>
          </div>
          <label>
            Se necesita de regreso el *
            <input type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </label>
          <div>
            <span className="pf-label">¿Es para un cliente?</span>
            <div className="pf-modo">
              <button type="button" className={'btn ' + (!esCliente ? 'btn--primary' : 'btn--ghost')} onClick={() => setEsCliente(false)}>
                No, se queda en la tienda
              </button>
              <button type="button" className={'btn ' + (esCliente ? 'btn--primary' : 'btn--ghost')} onClick={() => setEsCliente(true)}>
                Sí, es de un cliente
              </button>
            </div>
          </div>
          {esCliente && (
            <div className="pf-cliente">
              <div className="form-row">
                <label>
                  Nombre del cliente *
                  <input className="input" list="pf-clientes-lista" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} required />
                  <datalist id="pf-clientes-lista">
                    {clientes.map((c) => (
                      <option key={c.id} value={c.nombre} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Teléfono *
                  <input type="tel" className="input" value={clienteTel} onChange={(e) => setClienteTel(e.target.value)} required inputMode="tel" />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Tipo de prenda *
                  <input className="input" list="pf-prendas-lista" value={prenda} onChange={(e) => setPrenda(e.target.value)} required placeholder="Ej. Chamarra" />
                  <datalist id="pf-prendas-lista">
                    {PRENDAS_COMUNES.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Talla *
                  <input className="input" value={talla} onChange={(e) => setTalla(e.target.value)} required placeholder="Ej. M, 30, CH" />
                </label>
              </div>
            </div>
          )}
          <label>
            Orden relacionada (opcional)
            <select className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Ninguna</option>
              {ordenes.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.order_number} · {o.client_name}
                </option>
              ))}
            </select>
          </label>
          {fotosGuardadas.length > 0 && (
            <div className="photo-picker__grid">
              {fotosGuardadas.map((f, i) => (
                <div key={f.path} className="photo-picker__thumb">
                  <img src={f.url} alt="" />
                  <button type="button" aria-label="Quitar foto" onClick={() => setFotosGuardadas(fotosGuardadas.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <PhotoPicker files={files} onChange={setFiles} />
          {error && <p className="form-error">{error.message}</p>}
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Enviar a fábrica'}
          </button>
        </form>
      </div>
    </div>
  )
}
