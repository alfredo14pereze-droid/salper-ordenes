import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrder } from '../hooks/useOrder'
import { fetchOrdenEtapas, updateOrdenEtapa, updateOrderStatus } from '../services/ordersService'
import { useAuth } from '../contexts/AuthContext'
import { estacionDeRol } from '../config/vistasPorRol'
import { Loading, ErrorState } from '../components/common/States'

const conTalla = (talla) => (talla ? `T.${talla}` : '')

function PrendaResumen({ item }) {
  const sizesText = (item.sizes || [])
    .filter((s) => String(s.talla).trim())
    .map((s) => `${conTalla(s.talla)}: ${s.cantidad}`)
    .join(' · ')

  return (
    <div className="estacion-prenda">
      <p className="estacion-prenda__nombre">
        {item.garment || '—'}
        {item.color ? ` · ${item.color}` : ''}
      </p>
      {item.tela_nombre && <p className="estacion-prenda__detalle">Tela: {item.tela_nombre}</p>}
      <p className="estacion-prenda__detalle">{sizesText || 'Sin tallas capturadas'}</p>
    </div>
  )
}

// V96 — vista de estación (Parte 1): folio, cliente, prenda+tela+color,
// tallas y UN botón — la acción de mi etapa (o "Confirmar" si la orden
// todavía no arranca). Nada de precios/saldos/PDFs/facturación — eso
// vive en OrderDetailPage.jsx, que es donde llegan los demás roles.
export default function EstacionOrderPage() {
  const { id } = useParams()
  const { role } = useAuth()
  const estacion = estacionDeRol(role)
  const { order, loading: loadingOrder, error: errorOrder, refresh: refreshOrder } = useOrder(id)
  const [etapas, setEtapas] = useState([])
  const [loadingEtapas, setLoadingEtapas] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const loadEtapas = useCallback(async () => {
    const { data, error: fetchError } = await fetchOrdenEtapas(id)
    if (!fetchError) setEtapas(data || [])
    setLoadingEtapas(false)
  }, [id])

  useEffect(() => {
    loadEtapas()
  }, [loadEtapas])

  if (loadingOrder || loadingEtapas) return <Loading label="Cargando orden…" />
  if (errorOrder) return <ErrorState error={errorOrder} onRetry={refreshOrder} />
  if (!order) return <ErrorState error={new Error('Esta orden no existe.')} />

  const miEtapa = etapas.find((e) => e.etapa === estacion?.etapa)
  const yaTerminada = miEtapa?.estado === 'completado'

  async function refresh() {
    await Promise.all([refreshOrder(), loadEtapas()])
  }

  async function handleConfirmar() {
    setBusy(true)
    setError(null)
    const { error: err } = await updateOrderStatus(order.id, 'confirmado')
    setBusy(false)
    if (err) return setError(err)
    refresh()
  }

  async function handleAccion() {
    setBusy(true)
    setError(null)
    // Un solo tap hace las dos transiciones (pendiente -> en_proceso ->
    // completado) para que iniciado_en/completado_en queden completos,
    // igual que si alguien hubiera dado los 2 pasos por separado en la
    // vista completa (OrderEtapasCard).
    if (miEtapa?.estado === 'pendiente') {
      const { error: err1 } = await updateOrdenEtapa(order.id, estacion.etapa, 'en_proceso')
      if (err1) {
        setBusy(false)
        return setError(err1)
      }
    }
    const { error: err2 } = await updateOrdenEtapa(order.id, estacion.etapa, 'completado')
    setBusy(false)
    if (err2) return setError(err2)
    refresh()
  }

  return (
    <div className="page estacion-page">
      <Link to="/" className="back-link">
        ← Siguientes órdenes
      </Link>

      <h2 className="estacion-order__folio">#{order.order_number}</h2>
      <p className="estacion-order__cliente">{order.client_name}</p>

      <div className="estacion-list" style={{ marginTop: 14 }}>
        {(order.items || []).map((item, i) => (
          <PrendaResumen key={item.id || i} item={item} />
        ))}
      </div>

      {estacion?.consumoPlaceholder && (
        <div className="estacion-consumo">
          <span className="field-label">Reporte de consumo</span>
          <input type="text" className="input" placeholder="Próximamente" disabled />
        </div>
      )}

      {error && <p className="form-error">{error.message}</p>}

      {order.status === 'en_confirmacion' ? (
        <button type="button" className="btn btn--primary estacion-btn" disabled={busy} onClick={handleConfirmar}>
          {busy ? 'Guardando…' : 'Confirmar'}
        </button>
      ) : yaTerminada ? (
        <p className="estacion-order__listo">✓ Ya terminaste tu parte de esta orden</p>
      ) : (
        <button type="button" className="btn btn--primary estacion-btn" disabled={busy} onClick={handleAccion}>
          {busy ? 'Guardando…' : estacion?.accionLabel || 'Listo'}
        </button>
      )}
    </div>
  )
}
