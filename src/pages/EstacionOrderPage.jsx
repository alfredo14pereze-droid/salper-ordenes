import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrder } from '../hooks/useOrder'
import { fetchOrdenEtapas, updateOrdenEtapa, updateOrderStatus } from '../services/ordersService'
import { fetchInventarioTelas, marcarCorte } from '../services/movimientosTelaService'
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

// V102 — Parte 4: para `corte` específicamente, "Tela usada" ya no es un
// placeholder — un campo obligatorio POR CADA tela que use la orden
// (nunca por prenda, para mantenerlo simple), con la unidad de esa tela
// al lado. El botón cambia de "Finalizado" a "Cortado" y pide una
// confirmación simple antes de mandar (marcar_corte inserta el/los
// movimiento(s) consumo_corte Y completa la etapa de corte en una sola
// llamada). El operador no ve estimado/inventario/comparación — eso vive
// aparte, para admin, en OrderCorteResumen.jsx dentro del detalle normal
// de la orden.
function TelaUsadaCorte({ order, onCortado }) {
  const telaIds = useMemo(() => [...new Set((order.items || []).map((i) => i.tela_id).filter(Boolean))], [order.items])
  const [telas, setTelas] = useState({})
  const [cantidades, setCantidades] = useState({})
  const [confirmando, setConfirmando] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchInventarioTelas().then(({ data }) => {
      const map = {}
      for (const t of data || []) map[t.tela_id] = t
      setTelas(map)
    })
  }, [])

  if (telaIds.length === 0) {
    return <p className="form-error">Esta orden no tiene ninguna tela asignada a sus prendas — avisa a tienda antes de cortar.</p>
  }

  const todasCapturadas = telaIds.every((id) => Number(cantidades[id]) > 0)

  async function handleConfirmar() {
    setBusy(true)
    setError(null)
    const consumos = telaIds.map((tela_id) => ({ tela_id, cantidad: Number(cantidades[tela_id]) }))
    const { error: err } = await marcarCorte(order.id, consumos)
    setBusy(false)
    if (err) return setError(err)
    onCortado()
  }

  return (
    <div className="estacion-consumo">
      {telaIds.map((telaId) => (
        <label key={telaId} className="field-label" style={{ display: 'block', marginBottom: 10 }}>
          Tela usada — {telas[telaId]?.nombre || 'Tela'} {telas[telaId]?.unidad ? `(${telas[telaId].unidad})` : ''}
          <input
            type="number"
            min="0.01"
            step="0.01"
            className="input"
            value={cantidades[telaId] || ''}
            onChange={(e) => setCantidades({ ...cantidades, [telaId]: e.target.value })}
            required
          />
        </label>
      ))}
      {error && <p className="form-error">{error.message}</p>}
      {!confirmando ? (
        <button type="button" className="btn btn--primary estacion-btn" disabled={!todasCapturadas} onClick={() => setConfirmando(true)}>
          Cortado
        </button>
      ) : (
        <div className="estacion-acciones">
          <p>
            ¿Confirmas que se usaron{' '}
            {telaIds.map((telaId) => `${cantidades[telaId]} ${telas[telaId]?.unidad || ''} de ${telas[telaId]?.nombre || 'tela'}`).join(', ')} y la
            orden está cortada?
          </p>
          <button type="button" className="btn btn--primary estacion-btn" disabled={busy} onClick={handleConfirmar}>
            {busy ? 'Guardando…' : 'Sí, confirmar'}
          </button>
          <button type="button" className="btn btn--secondary estacion-btn" disabled={busy} onClick={() => setConfirmando(false)}>
            Cancelar
          </button>
        </div>
      )}
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
          {estacion?.consumoPlaceholder ? (
            terminada ? (
              <button type="button" className="btn btn--primary estacion-btn" disabled>
                Cortado
              </button>
            ) : (
              <TelaUsadaCorte order={order} onCortado={refresh} />
            )
          ) : (
            <button
              type="button"
              className={'btn estacion-btn' + (terminada ? ' btn--primary' : ' btn--secondary')}
              disabled={busy}
              onClick={() => handleCambiarEtapa('completado')}
            >
              Finalizado
            </button>
          )}
        </div>
      )}
      {terminada && <p className="estacion-order__listo">✓ Ya terminaste tu parte de esta orden</p>}
    </div>
  )
}
