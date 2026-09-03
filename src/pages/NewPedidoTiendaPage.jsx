import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPedidoTienda } from '../services/pedidosTiendaService'
import { recognizePedidoPhoto, MAX_OCR_FILE_SIZE_MB } from '../services/pedidoOcrService'
import { useProveedores } from '../hooks/useProveedores'
import PedidoArticulosEditor from '../components/pedidos/PedidoArticulosEditor'
import ProveedorSelect from '../components/pedidos/ProveedorSelect'
import RequireRole from '../components/common/RequireRole'
import { canManagePedidosTienda } from '../utils/permissions'
import { useAuth } from '../contexts/AuthContext'
import { Loading, ErrorState } from '../components/common/States'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const emptyArticulo = () => ({ nombreArticulo: '', cantidadPedida: '', talla: '' })

function isArticuloVacio(a) {
  return !a.nombreArticulo.trim() && !(Number(a.cantidadPedida) > 0)
}

export default function NewPedidoTiendaPage() {
  return (
    <RequireRole allow={canManagePedidosTienda}>
      <NewPedidoTiendaForm />
    </RequireRole>
  )
}

function NewPedidoTiendaForm() {
  const { profile } = useAuth()
  const { proveedores, loading, error, refresh } = useProveedores()
  const [proveedorId, setProveedorId] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [pedidoPor, setPedidoPor] = useState(profile?.full_name || '')
  const [fechaPedido, setFechaPedido] = useState(todayISO())
  const [notas, setNotas] = useState('')
  const [articulos, setArticulos] = useState([emptyArticulo()])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const navigate = useNavigate()

  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrWarning, setOcrWarning] = useState(null)
  const [ocrError, setOcrError] = useState(null)

  async function handleOcrFileInput(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setOcrLoading(true)
    setOcrWarning(null)
    setOcrError(null)

    const { data, error: ocrErr } = await recognizePedidoPhoto(file)
    setOcrLoading(false)

    if (ocrErr) {
      setOcrError(ocrErr)
      return
    }
    if (data.warning) {
      setOcrWarning(data.warning)
    }
    if (data.articulos.length > 0) {
      // Nunca pisa lo que ya se haya tecleado a mano: conserva las filas
      // con contenido y agrega las reconocidas después, más una fila
      // vacía nueva al final para seguir capturando (mismo patrón de
      // auto-agregar). El usuario revisa/corrige todo antes de crear el
      // pedido — esto solo prellena.
      setArticulos((current) => {
        const conContenido = current.filter((a) => !isArticuloVacio(a))
        const reconocidos = data.articulos.map((a) => ({
          nombreArticulo: a.nombre,
          cantidadPedida: String(a.cantidad),
          talla: a.talla || '',
        }))
        return [...conContenido, ...reconocidos, emptyArticulo()]
      })
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!proveedor.trim() || !pedidoPor.trim() || !fechaPedido) {
      setSubmitError(new Error('Completa los campos requeridos: proveedor, quién pide y fecha del pedido.'))
      return
    }

    // Mismo filtro que OrderItemsEditor/NewOrderPage: descarta la fila
    // vacía sobrante que dejó el auto-agregar.
    const cleanArticulos = articulos
      .filter((a) => a.nombreArticulo.trim() && Number(a.cantidadPedida) > 0)
      .map((a) => ({
        nombreArticulo: a.nombreArticulo.trim(),
        cantidadPedida: Number(a.cantidadPedida),
        talla: a.talla.trim(),
      }))

    if (cleanArticulos.length === 0) {
      setSubmitError(new Error('Agrega al menos un artículo con cantidad.'))
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    const { data, error: createError } = await createPedidoTienda({
      proveedor: proveedor.trim(),
      proveedorId: proveedorId || null,
      pedidoPor: pedidoPor.trim(),
      fechaPedido,
      notas: notas.trim(),
      articulos: cleanArticulos,
    })

    setSubmitting(false)

    if (createError) {
      setSubmitError(createError)
      return
    }

    navigate(`/pedidos-proveedor/${data.id}`)
  }

  if (loading) return <Loading label="Cargando proveedores…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page page--narrow">
      <h2 className="section-title">Nuevo pedido a proveedor</h2>

      <form className="order-form" onSubmit={handleSubmit}>
        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Proveedor *
          </span>
          <ProveedorSelect
            proveedores={proveedores}
            value={proveedorId}
            onChange={(id, nombre) => {
              setProveedorId(id)
              setProveedor(nombre)
            }}
            onProveedorCreated={refresh}
          />
        </div>

        <label>
          Quién pide *
          <input type="text" className="input" value={pedidoPor} onChange={(e) => setPedidoPor(e.target.value)} />
        </label>

        <label>
          Fecha del pedido *
          <input
            type="date"
            className="input"
            value={fechaPedido}
            onChange={(e) => setFechaPedido(e.target.value)}
          />
        </label>

        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Foto o PDF de la nota o remisión del proveedor
          </span>
          <label className="photo-picker__add" style={{ display: 'inline-flex' }}>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleOcrFileInput}
              hidden
              disabled={ocrLoading}
            />
            {ocrLoading ? 'Leyendo el archivo…' : '+ Subir foto o PDF y prellenar artículos'}
          </label>
          <p className="pantone-hint">
            Foto o PDF, máximo {MAX_OCR_FILE_SIZE_MB}MB. El reconocimiento automático no es perfecto — revisa y
            corrige los artículos antes de crear el pedido.
          </p>
          {ocrWarning && <p className="pantone-hint">{ocrWarning}</p>}
          {ocrError && <p className="form-error">{ocrError.message}</p>}
        </div>

        <PedidoArticulosEditor articulos={articulos} onChange={setArticulos} />

        <label>
          Notas
          <textarea
            className="input"
            rows={3}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional…"
          />
        </label>

        {submitError && <p className="form-error">{submitError.message}</p>}

        <div className="order-form__actions">
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Crear pedido'}
          </button>
        </div>
      </form>
    </div>
  )
}
