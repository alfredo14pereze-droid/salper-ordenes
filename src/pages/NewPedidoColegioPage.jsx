import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState } from '../components/common/States'
import ArticulosColegioEditor, {
  emptyLinea,
  importeDeLinea,
  lineaCompleta,
} from '../components/pedidosColegio/ArticulosColegioEditor'
import { useColegios } from '../hooks/usePedidosColegio'
import { createPedido, fetchPedidoById } from '../services/pedidosColegioService'
import { buildPedidoColegioPdfBlob, pedidoColegioPdfFileName } from '../utils/generatePedidoColegioPdf'
import { canManagePedidosColegio } from '../utils/permissions'
import { formatMonto, round2 } from '../utils/pedidosColegio'

// V57 — alta de un Pedido Colegio (BETA, solo admin_general).
export default function NewPedidoColegioPage() {
  return (
    <RequireRole allow={canManagePedidosColegio}>
      <NewPedidoColegioForm />
    </RequireRole>
  )
}

function NewPedidoColegioForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { colegios, loading, error } = useColegios()

  const [colegioId, setColegioId] = useState(searchParams.get('colegio') || '')
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteReferencia, setClienteReferencia] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [lineas, setLineas] = useState([emptyLinea()])
  // Anticipo: por porcentaje (default 100, como el recibo de ejemplo) o
  // por monto directo — solo uno de los dos manda al servidor.
  const [anticipoModo, setAnticipoModo] = useState('porcentaje')
  const [anticipoPorcentaje, setAnticipoPorcentaje] = useState('100')
  const [anticipoMontoInput, setAnticipoMontoInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const lineasValidas = useMemo(() => lineas.filter(lineaCompleta), [lineas])
  const subtotal = useMemo(() => round2(lineasValidas.reduce((sum, l) => sum + importeDeLinea(l), 0)), [lineasValidas])
  const anticipoMonto =
    anticipoModo === 'porcentaje'
      ? round2((subtotal * (Number(anticipoPorcentaje) || 0)) / 100)
      : round2(Number(anticipoMontoInput) || 0)
  const saldo = round2(subtotal - anticipoMonto)

  const anticipoInvalido =
    anticipoModo === 'porcentaje'
      ? Number(anticipoPorcentaje) < 0 || Number(anticipoPorcentaje) > 100 || anticipoPorcentaje === ''
      : anticipoMonto < 0 || anticipoMonto > subtotal

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError(null)

    if (!colegioId) return setSubmitError(new Error('Elige el colegio.'))
    if (!clienteNombre.trim()) return setSubmitError(new Error('Falta el nombre de quien hace el pedido.'))
    if (lineasValidas.length === 0) {
      return setSubmitError(new Error('Agrega al menos un artículo con cantidad y precio.'))
    }
    if (anticipoInvalido) return setSubmitError(new Error('Revisa el anticipo: no puede pasar del subtotal.'))

    setSaving(true)
    const { data: pedido, error: createError } = await createPedido({
      colegioId,
      clienteNombre: clienteNombre.trim(),
      clienteReferencia: clienteReferencia.trim(),
      clienteTelefono: clienteTelefono.trim(),
      anticipoPorcentaje: anticipoModo === 'porcentaje' ? Number(anticipoPorcentaje) : null,
      anticipoMonto: anticipoModo === 'monto' ? anticipoMonto : null,
      articulos: lineasValidas.map((l) => ({
        articulo: l.articulo.trim(),
        talla: l.talla.trim(),
        cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio),
      })),
    })

    if (createError) {
      setSaving(false)
      setSubmitError(createError)
      return
    }

    // El recibo en PDF se genera aquí (con lo que YA guardó el servidor) y
    // se abre en vista previa en el detalle — mismo criterio que las
    // órdenes de producción. Si falla, el pedido ya quedó guardado: se
    // navega igual y el botón "Generar recibo PDF" sigue disponible ahí.
    let pdfPreview = null
    try {
      const { data: completo } = await fetchPedidoById(pedido.id)
      if (completo) {
        pdfPreview = { blob: await buildPedidoColegioPdfBlob(completo), fileName: pedidoColegioPdfFileName(completo) }
      }
    } catch {
      pdfPreview = null
    }

    setSaving(false)
    navigate(`/pedidos-colegio/${pedido.id}`, { state: { pdfPreview } })
  }

  if (loading) return <Loading label="Cargando colegios…" />
  if (error) return <ErrorState error={error} />

  return (
    <div className="page page--narrow">
      <Link to="/pedidos-colegio" className="back-link">
        ← Volver a Pedidos Colegio
      </Link>
      <h2 className="section-title">Nuevo pedido de colegio</h2>

      <form className="order-form" onSubmit={handleSubmit}>
        <label>
          Colegio *
          <select className="input" value={colegioId} onChange={(e) => setColegioId(e.target.value)}>
            <option value="">Selecciona…</option>
            {colegios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.codigo_folio})
              </option>
            ))}
          </select>
        </label>

        <div className="form-row">
          <label>
            Nombre de quien hace el pedido *
            <input type="text" className="input" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} />
          </label>
          <label>
            Referencia (grado / grupo del alumno)
            <input
              type="text"
              className="input"
              placeholder="Ej. 1° Primaria"
              value={clienteReferencia}
              onChange={(e) => setClienteReferencia(e.target.value)}
            />
          </label>
        </div>
        <label>
          Teléfono
          <input
            type="tel"
            className="input"
            placeholder="Opcional"
            value={clienteTelefono}
            onChange={(e) => setClienteTelefono(e.target.value)}
          />
        </label>

        <ArticulosColegioEditor lineas={lineas} onChange={setLineas} />

        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Anticipo
          </span>
          <div className="form-row">
            <div className="chips" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className={'chip' + (anticipoModo === 'porcentaje' ? ' chip--active' : '')}
                onClick={() => setAnticipoModo('porcentaje')}
              >
                Porcentaje
              </button>
              <button
                type="button"
                className={'chip' + (anticipoModo === 'monto' ? ' chip--active' : '')}
                onClick={() => setAnticipoModo('monto')}
              >
                Monto directo
              </button>
            </div>
            {anticipoModo === 'porcentaje' ? (
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="input"
                aria-label="Porcentaje de anticipo"
                value={anticipoPorcentaje}
                onChange={(e) => setAnticipoPorcentaje(e.target.value)}
                placeholder="100"
              />
            ) : (
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                aria-label="Monto de anticipo"
                value={anticipoMontoInput}
                onChange={(e) => setAnticipoMontoInput(e.target.value)}
                placeholder="0.00"
              />
            )}
          </div>
        </div>

        {anticipoInvalido && (
          <p className="form-error" style={{ margin: 0 }}>
            {anticipoModo === 'porcentaje'
              ? 'El porcentaje de anticipo debe estar entre 0 y 100.'
              : `El anticipo no puede pasar del subtotal (${formatMonto(subtotal)}).`}
          </p>
        )}

        <div className="payments-summary">
          <div className="payments-summary__stat">
            <span className="payments-summary__label">Subtotal</span>
            <span className="payments-summary__value">{formatMonto(subtotal)}</span>
          </div>
          <div className="payments-summary__stat">
            <span className="payments-summary__label">Anticipo</span>
            <span className="payments-summary__value">{formatMonto(anticipoMonto)}</span>
          </div>
          <div className="payments-summary__stat">
            <span className="payments-summary__label">Saldo</span>
            <span
              className="payments-summary__value"
              style={{ color: saldo > 0 ? 'var(--color-danger)' : 'var(--color-good)' }}
            >
              {formatMonto(saldo)}
            </span>
          </div>
        </div>

        {submitError && <p className="form-error">{submitError.message}</p>}

        <div className="order-form__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Crear pedido y generar recibo'}
          </button>
        </div>
      </form>
    </div>
  )
}
