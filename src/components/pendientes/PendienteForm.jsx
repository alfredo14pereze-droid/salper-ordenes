import { useEffect, useState } from 'react'
import PhotoPicker from '../orders/PhotoPicker'
import { fetchClientes } from '../../services/clientesService'
import { crearPendiente, editarPendiente, fetchTipos, uploadPendientePhoto } from '../../services/pendientesService'

// Alta y edición de un pendiente (modal). En edición solo se llega mientras
// fábrica no lo ha recibido (el servidor lo vuelve a validar).
export default function PendienteForm({ pendiente = null, onClose, onSaved }) {
  const editing = !!pendiente
  const [tipos, setTipos] = useState([])
  const [clientes, setClientes] = useState([])
  const [descripcion, setDescripcion] = useState(pendiente?.descripcion || '')
  const [tipoId, setTipoId] = useState(pendiente?.tipo_id || '')
  const [cantidad, setCantidad] = useState(pendiente?.cantidad ?? 1)
  const [esCliente, setEsCliente] = useState(!!pendiente?.es_para_cliente)
  const [clienteNombre, setClienteNombre] = useState(pendiente?.cliente_nombre || '')
  const [clienteTel, setClienteTel] = useState(pendiente?.cliente_telefono || '')
  const [prenda, setPrenda] = useState(pendiente?.prenda || '')
  const [talla, setTalla] = useState(pendiente?.talla || '')
  const [inventariado, setInventariado] = useState(pendiente?.inventariado ?? null)
  const [pagado, setPagado] = useState(pendiente?.pagado ?? null)
  const [fotosGuardadas, setFotosGuardadas] = useState(pendiente?.fotos || [])
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchTipos().then(({ data }) => setTipos(data || []))
    fetchClientes().then(({ data }) => setClientes(data || []))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (inventariado === null) {
      setError(new Error('Indica si ya quedó inventariado o no.'))
      return
    }
    if (esCliente && pagado === null) {
      setError(new Error('Indica si el cliente ya pagó o no.'))
      return
    }
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
      fechaRequerida: null,
      // Si el nombre coincide con un cliente del catálogo, se liga (sirve para reportes);
      // si no, es un cliente incidental y solo se guarda el nombre.
      clienteId: esCliente ? clientes.find((c) => c.nombre.trim().toLowerCase() === clienteNombre.trim().toLowerCase())?.id || null : null,
      esParaCliente: esCliente,
      clienteNombre: clienteNombre.trim(),
      clienteTelefono: clienteTel.trim(),
      prenda: prenda.trim(),
      talla: talla.trim(),
      inventariado,
      pagado,
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
          <div className="form-row">
            <label>
              Tipo de prenda *
              <input className="input" value={prenda} onChange={(e) => setPrenda(e.target.value)} required placeholder="Ej. Chamarra azul" />
            </label>
            <label>
              Talla *
              <input className="input" value={talla} onChange={(e) => setTalla(e.target.value)} required placeholder="Ej. M, 30, CH" />
            </label>
          </div>

          <div>
            <span className="pf-label">¿Ya quedó inventariado? *</span>
            <div className="pf-modo">
              <button type="button" className={'btn ' + (inventariado === true ? 'btn--primary' : 'btn--ghost')} onClick={() => setInventariado(true)}>
                Inventariado
              </button>
              <button type="button" className={'btn ' + (inventariado === false ? 'btn--primary' : 'btn--ghost')} onClick={() => setInventariado(false)}>
                No inventariado
              </button>
            </div>
          </div>

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
              <div>
                <span className="pf-label">¿Ya está pagado? *</span>
                <div className="pf-modo">
                  <button type="button" className={'btn ' + (pagado === true ? 'btn--primary' : 'btn--ghost')} onClick={() => setPagado(true)}>
                    Pagado
                  </button>
                  <button type="button" className={'btn ' + (pagado === false ? 'btn--primary' : 'btn--ghost')} onClick={() => setPagado(false)}>
                    No pagado
                  </button>
                </div>
              </div>
            </div>
          )}
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
