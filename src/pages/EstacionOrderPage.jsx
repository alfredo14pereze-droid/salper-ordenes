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

// V96/V97 — vista de estación (Parte 1): folio, cliente, prenda+tela+color,
// tallas, y dos botones — "En progreso" / "Finalizado" (pendiente ->
// en_proceso -> completado en orden_etapas) — o "Confirmar" si la orden
// todavía no arranca. Nada de precios/saldos/PDFs/facturación — eso vive
// en OrderDetailPage.jsx, que es donde llegan los demás roles.
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
  const enProceso = miEtapa?.estado === 'en_proceso'
  const terminada = miEtapa?.estado === 'completado'

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

  async function handleCambiarEtapa(nuevoEstado) {
    setBusy(true)
    setError(null)
    const { error: err } = await updateOrdenEtapa(order.id, estacion.etapa, nuevoEstado)
    setBusy(false)
    if (err) return setError(err)
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
      ) : (
        <div className="estacion-acciones">
          <button
            type="button"
            className={'btn estacion-btn' + (enProceso || terminada ? ' btn--primary' : ' btn--secondary')}
            disabled={busy}
            onClick={() => handleCambiarEtapa('en_proceso')}
          >
            En progreso
          </button>
          <button
            type="button"
            className={'btn estacion-btn' + (terminada ? ' btn--primary' : ' btn--secondary')}
            disabled={busy}
            onClick={() => handleCambiarEtapa('completado')}
          >
            Finalizado
          </button>
        </div>
      )}
      {terminada && <p className="estacion-order__listo">✓ Ya terminaste tu parte de esta orden</p>}
    </div>
  )
}
