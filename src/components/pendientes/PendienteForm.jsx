import { useEffect, useState } from 'react'
import PhotoPicker from '../orders/PhotoPicker'
import { fetchClientes } from '../../services/clientesService'
import { crearPendiente, editarPendiente, fetchTipos, uploadPendientePhoto, marcarBaja } from '../../services/pendientesService'
import { estadoPago, formatoDinero, prendasDe } from '../../utils/pendientesPago'

const LINEA_VACIA = { prenda: '', talla: '', cantidad: '1' }

// V129 — varias prendas por pendiente: al llenar prenda y talla de la última
// línea se agrega otra vacía sola (la vacía del final no se guarda).
function lineasIniciales(pendiente) {
  const l = pendiente ? prendasDe(pendiente).map((x) => ({ prenda: x.prenda, talla: x.talla, cantidad: String(x.cantidad ?? 1) })) : []
  return [...l, { ...LINEA_VACIA }]
}
const lineaLlena = (l) => l.prenda.trim() && l.talla.trim()

// Alta y edición de un pendiente (modal). En edición solo se llega mientras
// fábrica no lo ha recibido (el servidor lo vuelve a validar).
export default function PendienteForm({ pendiente = null, onClose, onSaved }) {
  const editing = !!pendiente
  const [tipos, setTipos] = useState([])
  const [clientes, setClientes] = useState([])
  const [descripcion, setDescripcion] = useState(pendiente?.descripcion || '')
  const [tipoId, setTipoId] = useState(pendiente?.tipo_id || '')
  const [esCliente, setEsCliente] = useState(!!pendiente?.es_para_cliente)
  const [clienteNombre, setClienteNombre] = useState(pendiente?.cliente_nombre || '')
  const [clienteTel, setClienteTel] = useState(pendiente?.cliente_telefono || '')
  const [lineas, setLineas] = useState(() => lineasIniciales(pendiente))
  const [inventariado, setInventariado] = useState(pendiente?.inventariado ?? null)
  const [pagoEstado, setPagoEstado] = useState(() => estadoPago(pendiente))
  // V138 — baja en inventario (solo de cliente): true/false; null = sin elegir.
  const [baja, setBaja] = useState(pendiente?.es_para_cliente ? pendiente.baja_inventario ?? false : null)
  const [pagoTotal, setPagoTotal] = useState(pendiente?.pago_total != null ? String(pendiente.pago_total) : '')
  const [pagoAnticipo, setPagoAnticipo] = useState(pendiente?.pago_anticipo != null ? String(pendiente.pago_anticipo) : '')
  const [fotosGuardadas, setFotosGuardadas] = useState(pendiente?.fotos || [])
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchTipos().then(({ data }) => setTipos(data || []))
    fetchClientes().then(({ data }) => setClientes(data || []))
  }, [])

  function updateLinea(i, patch) {
    setLineas((prev) => {
      const next = prev.map((l, j) => (j === i ? { ...l, ...patch } : l))
      if (i === next.length - 1 && lineaLlena(next[i])) next.push({ ...LINEA_VACIA })
      return next
    })
  }

  function quitarLinea(i) {
    setLineas((prev) => {
      const next = prev.filter((_, j) => j !== i)
      return next.length > 0 && !lineaLlena(next[next.length - 1]) ? next : [...next, { ...LINEA_VACIA }]
    })
  }

  const prendasValidas = lineas.filter((l) => l.prenda.trim() || l.talla.trim())
  const totalPiezas = prendasValidas.reduce((n, l) => n + (Number(l.cantidad) || 0), 0)
  const restaAnticipo = (Number(pagoTotal) || 0) - (Number(pagoAnticipo) || 0)

  async function handleSubmit(e) {
    e.preventDefault()
    if (prendasValidas.length === 0 || prendasValidas.some((l) => !lineaLlena(l))) {
      setError(new Error('Cada prenda necesita su tipo y su talla.'))
      return
    }
    if (prendasValidas.some((l) => !(Number(l.cantidad) > 0))) {
      setError(new Error('La cantidad de cada prenda debe ser mayor a cero.'))
      return
    }
    if (!esCliente && inventariado === null) {
      setError(new Error('Indica si ya quedó inventariado o no.'))
      return
    }
    if (esCliente && baja === null) {
      setError(new Error('Indica si la prenda ya se dio de baja en el inventario o sigue pendiente de baja.'))
      return
    }
    if (esCliente && !pagoEstado) {
      setError(new Error('Indica si el cliente ya pagó, no ha pagado o dejó anticipo.'))
      return
    }
    if (esCliente && pagoEstado === 'anticipo') {
      if (!(Number(pagoTotal) > 0)) return setError(new Error('Captura el total del trabajo.'))
      if (!(Number(pagoAnticipo) > 0)) return setError(new Error('Captura cuánto fue el anticipo.'))
      if (Number(pagoAnticipo) >= Number(pagoTotal)) {
        return setError(new Error('El anticipo debe ser menor al total; si ya pagó todo, elige Pagado.'))
      }
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
      cantidad: totalPiezas,
      fechaRequerida: null,
      // Si el nombre coincide con un cliente del catálogo, se liga (sirve para reportes);
      // si no, es un cliente incidental y solo se guarda el nombre.
      clienteId: esCliente ? clientes.find((c) => c.nombre.trim().toLowerCase() === clienteNombre.trim().toLowerCase())?.id || null : null,
      esParaCliente: esCliente,
      clienteNombre: clienteNombre.trim(),
      clienteTelefono: clienteTel.trim(),
      prenda: prendasValidas[0].prenda.trim(),
      talla: prendasValidas[0].talla.trim(),
      prendas: prendasValidas.map((l) => ({ prenda: l.prenda.trim(), talla: l.talla.trim(), cantidad: Number(l.cantidad) })),
      inventariado: esCliente ? null : inventariado,
      pagado: esCliente ? pagoEstado === 'pagado' : null,
      pagoEstado: esCliente ? pagoEstado : null,
      pagoTotal: pagoEstado === 'anticipo' ? Number(pagoTotal) : null,
      pagoAnticipo: pagoEstado === 'anticipo' ? Number(pagoAnticipo) : null,
      fotos: [...fotosGuardadas, ...nuevas],
    }
    const { data, error: saveErr } = editing ? await editarPendiente({ id: pendiente.id, ...payload }) : await crearPendiente(payload)
    if (saveErr) {
      setSaving(false)
      setError(saveErr)
      return
    }
    // V138 — la baja en inventario se guarda aparte (pf_marcar_baja), sin tocar
    // pf_crear/pf_editar; el pendiente nace "pendiente de baja".
    let guardado = data
    if (esCliente && data?.id && (data.baja_inventario ?? false) !== baja) {
      const { data: conBaja, error: bajaErr } = await marcarBaja(data.id, baja)
      if (bajaErr) {
        setSaving(false)
        setError(new Error(`El pendiente se guardó, pero no se pudo registrar la baja en inventario: ${bajaErr.message}`))
        return
      }
      guardado = conBaja || data
    }
    setSaving(false)
    onSaved?.(guardado)
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
          <div>
            <span className="pf-label">Prendas *</span>
            <div className="pf-lineas">
              <div className="pf-lineas__head">
                <span>Tipo de prenda</span>
                <span>Talla</span>
                <span>Cant.</span>
                <span />
              </div>
              {lineas.map((l, i) => (
                <div key={i} className="pf-lineas__row">
                  <input
                    className="input"
                    value={l.prenda}
                    onChange={(e) => updateLinea(i, { prenda: e.target.value })}
                    required={i === 0}
                    placeholder={i === 0 ? 'Ej. Chamarra azul' : 'Otra prenda (opcional)'}
                    aria-label={`Tipo de prenda ${i + 1}`}
                  />
                  <input
                    className="input"
                    value={l.talla}
                    onChange={(e) => updateLinea(i, { talla: e.target.value })}
                    required={i === 0}
                    placeholder="M, 30, CH"
                    aria-label={`Talla ${i + 1}`}
                  />
                  <input
                    type="number"
                    min="1"
                    className="input"
                    value={l.cantidad}
                    onChange={(e) => updateLinea(i, { cantidad: e.target.value })}
                    inputMode="numeric"
                    aria-label={`Cantidad ${i + 1}`}
                  />
                  {lineas.length > 1 && (l.prenda || l.talla) ? (
                    <button type="button" className="sizes-row__remove" onClick={() => quitarLinea(i)} aria-label={`Quitar prenda ${i + 1}`}>
                      ×
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
            {prendasValidas.length > 1 && <p className="pantone-hint">Total: {totalPiezas} piezas</p>}
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
                  <button type="button" className={'btn ' + (pagoEstado === 'pagado' ? 'btn--primary' : 'btn--ghost')} onClick={() => setPagoEstado('pagado')}>
                    Pagado
                  </button>
                  <button type="button" className={'btn ' + (pagoEstado === 'no_pagado' ? 'btn--primary' : 'btn--ghost')} onClick={() => setPagoEstado('no_pagado')}>
                    No pagado
                  </button>
                  <button type="button" className={'btn ' + (pagoEstado === 'anticipo' ? 'btn--primary' : 'btn--ghost')} onClick={() => setPagoEstado('anticipo')}>
                    Anticipo
                  </button>
                </div>
              </div>
              <div>
                <span className="pf-label">¿Ya se dio de baja en el inventario? *</span>
                <div className="pf-modo">
                  <button type="button" className={'btn ' + (baja === true ? 'btn--primary' : 'btn--ghost')} onClick={() => setBaja(true)}>
                    Dado de baja
                  </button>
                  <button type="button" className={'btn ' + (baja === false ? 'btn--primary' : 'btn--ghost')} onClick={() => setBaja(false)}>
                    Pendiente de baja
                  </button>
                </div>
              </div>
              {pagoEstado === 'anticipo' && (
                <div className="form-row">
                  <label>
                    Total del trabajo ($) *
                    <input type="number" min="0" step="0.01" className="input" value={pagoTotal} onChange={(e) => setPagoTotal(e.target.value)} required inputMode="decimal" />
                  </label>
                  <label>
                    Anticipo ($) *
                    <input type="number" min="0" step="0.01" className="input" value={pagoAnticipo} onChange={(e) => setPagoAnticipo(e.target.value)} required inputMode="decimal" />
                  </label>
                  <p className="pf-resta">
                    Resta: <strong>{formatoDinero(Math.max(0, restaAnticipo))}</strong>
                  </p>
                </div>
              )}
            </div>
          )}
          {!esCliente && (
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
