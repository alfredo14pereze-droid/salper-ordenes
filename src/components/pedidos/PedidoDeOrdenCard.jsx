import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { canEditFinanzas } from '../../utils/permissions'
import { agregarOrdenAPedido, crearPedido, fetchPedidosLista, quitarOrdenDePedido } from '../../services/pedidosService'
import { formatMxn } from '../../services/finanzasService'
import { datosParaGuardar, ordenarPedidosParaCliente, PEDIDO_VACIO } from '../../utils/pedidos'
import { olvidarPedido, usePedidoDeOrden } from '../../hooks/usePedidoDeOrden'

// V176 — en el detalle de la orden: a qué pedido pertenece (con liga) o,
// si va suelta, agregarla a un pedido o abrir uno nuevo con ella.
export default function PedidoDeOrdenCard({ order, onUpdated }) {
  const { role } = useAuth()
  const navigate = useNavigate()
  const pedido = usePedidoDeOrden(order)
  const editable = canEditFinanzas(role) && !order.eliminada_en && !order.cancelled_at
  const [eligiendo, setEligiendo] = useState(false)
  const [lista, setLista] = useState([])
  const [elegido, setElegido] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!eligiendo) return
    fetchPedidosLista().then(({ data }) => setLista(data || []))
  }, [eligiendo])

  async function agregar() {
    const p = lista.find((x) => x.id === elegido)
    if (!p) return
    if (p.es_mostrador && !window.confirm(`El pedido ${p.folio} es de venta de mostrador: esta orden se queda sin precios ni factura. ¿Continuar?`)) return
    setBusy(true)
    setError(null)
    const { error: err } = await agregarOrdenAPedido(p.id, order.id)
    setBusy(false)
    if (err) return setError(err)
    setEligiendo(false)
    onUpdated?.()
  }

  async function nuevo() {
    setBusy(true)
    setError(null)
    const { data, error: err } = await crearPedido(datosParaGuardar({ ...PEDIDO_VACIO, cliente: order.client_name, clientId: order.client_id || '' }), [order.id])
    setBusy(false)
    if (err) return setError(err)
    navigate(`/pedido/${data.id}`)
  }

  async function quitar() {
    if (!window.confirm(`¿Quitar la orden del pedido ${pedido?.folio || ''}? Queda como orden suelta.`)) return
    setBusy(true)
    setError(null)
    const { error: err } = await quitarOrdenDePedido(order.id)
    setBusy(false)
    if (err) return setError(err)
    olvidarPedido(order.pedido_id)
    onUpdated?.()
  }

  if (order.pedido_id) {
    return (
      <div>
        <div className="pedido-banner">
          <div>
            <span className="field-label" style={{ display: 'block' }}>
              Pedido
            </span>
            {pedido ? (
              <>
                <Link to={`/pedido/${pedido.id}`}>
                  <b>{pedido.folio}</b>
                </Link>{' '}
                · {pedido.cliente}
                {pedido.es_mostrador && (
                  <span className="badge badge--mostrador" style={{ marginLeft: 6 }}>
                    Mostrador
                  </span>
                )}
              </>
            ) : (
              'Cargando…'
            )}
          </div>
          {editable && (
            <button type="button" className="btn btn--ghost btn--small" onClick={quitar} disabled={busy}>
              Quitar del pedido
            </button>
          )}
        </div>
        <p className="pantone-hint" style={{ margin: '6px 0 0' }}>
          El anticipo, los abonos y la factura se manejan en el pedido.
        </p>
        {error && <p className="form-error">{error.message}</p>}
      </div>
    )
  }

  return (
    <div>
      <div className="pedido-banner">
        <div>
          <span className="field-label" style={{ display: 'block' }}>
            Pedido
          </span>
          Orden suelta (no está en un pedido).
        </div>
        {editable && !eligiendo && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setEligiendo(true)} disabled={busy}>
              Agregar a un pedido
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={nuevo} disabled={busy}>
              Nuevo pedido con esta orden
            </button>
          </div>
        )}
      </div>
      {eligiendo && (
        <div className="pedido-agregar">
          <select className="input" value={elegido} onChange={(e) => setElegido(e.target.value)} aria-label="Pedido">
            <option value="">Elige el pedido…</option>
            {ordenarPedidosParaCliente(lista, { clientId: order.client_id, cliente: order.client_name }).map((p) => (
              <option key={p.id} value={p.id}>
                {p.folio} · {p.cliente} · {p.ordenes} {p.ordenes === 1 ? 'orden' : 'órdenes'}
                {p.es_mostrador ? ' · mostrador' : ` · saldo ${formatMxn(p.saldo)}`}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--primary btn--small" onClick={agregar} disabled={!elegido || busy}>
            Agregar
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setEligiendo(false)}>
            Cancelar
          </button>
        </div>
      )}
      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}
