import { useEffect, useState } from 'react'
import PhotoPicker from '../orders/PhotoPicker'
import { fetchClientes } from '../../services/clientesService'
import { fetchOrders } from '../../services/ordersService'
import { crearPendiente, editarPendiente, fetchTipos, uploadPendientePhoto } from '../../services/pendientesService'

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
  const [clienteId, setClienteId] = useState(pendiente?.cliente_id || '')
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
      clienteId,
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
          <div className="form-row">
            <label>
              Cliente (opcional)
              <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Sin cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
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
          </div>
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
