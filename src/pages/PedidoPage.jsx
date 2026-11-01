import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState } from '../components/common/States'
import StatusBadge from '../components/orders/StatusBadge'
import PedidoDatosForm from '../components/pedidos/PedidoDatosForm'
import { useAuth } from '../contexts/AuthContext'
import { canEditFinanzas, canViewFinanzas } from '../utils/permissions'
import { formatMxn } from '../services/finanzasService'
import { METODOS_PAGO } from '../services/anticiposService'
import { fetchOrders } from '../services/ordersService'
import {
  actualizarPedido,
  agregarOrdenAPedido,
  borrarAbonoPedido,
  crearAbonoPedido,
  eliminarPedido,
  fetchPedido,
  fetchPedidoAbonos,
  fetchPedidoTotales,
  quitarOrdenDePedido,
} from '../services/pedidosService'
import { datosParaGuardar, errorPedido, pedidoAFormulario } from '../utils/pedidos'
import { formatDate, formatDateTime } from '../utils/dates'

// V176 — un pedido: sus órdenes, total (calculado), anticipo, abonos, saldo
// y datos de factura. Lo ven los roles de dinero; lo editan ventas y
// administradores de tienda (mismo criterio que los precios).
export default function PedidoPage() {
  return (
    <RequireRole allow={canViewFinanzas}>
      <PedidoContent />
    </RequireRole>
  )
}

const ROLES_ABONO = ['ventas', 'contabilidad', 'admin_tienda', 'admin_general']
const ROLES_BORRAR_ABONO = ['admin_tienda', 'admin_general']

function PedidoContent() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role, profile } = useAuth()
  const puedeEditar = canEditFinanzas(role)

  const [pedido, setPedido] = useState(null)
  const [totales, setTotales] = useState(null)
  const [abonos, setAbonos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    const [p, t, a] = await Promise.all([fetchPedido(id), fetchPedidoTotales(id), fetchPedidoAbonos(id)])
    setError(p.error || t.error || a.error || null)
    setPedido(p.data || null)
    setTotales(t.data || null)
    setAbonos(a.data || [])
    setLoading(false)
  }, [id])
  useEffect(() => {
    cargar()
  }, [cargar])

  if (loading) return <Loading />
  if (error) return <ErrorState error={error} />
  if (!pedido) return <ErrorState error={new Error('Pedido no encontrado.')} />

  const eliminado = !!pedido.deleted_at
  const editable = puedeEditar && !eliminado
  const ordenes = totales?.ordenes || []
  const vacio = ordenes.length === 0 && abonos.length === 0 && !(Number(pedido.anticipo) > 0)

  async function handleEliminar() {
    if (!window.confirm(`¿Eliminar el pedido ${pedido.folio}? El folio no se vuelve a usar.`)) return
    const { error: err } = await eliminarPedido(pedido.id)
    if (err) setError(err)
    else navigate('/pedidos')
  }

  return (
    <div className="page page--narrow pedido-page">
      <p style={{ margin: 0 }}>
        <Link to="/pedidos">← Pedidos</Link>
      </p>
      <div className="pedido-page__head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Pedido {pedido.folio}
        </h2>
        {pedido.es_mostrador && <span className="badge badge--mostrador">Venta de mostrador</span>}
        {eliminado && <span className="badge">Eliminado</span>}
      </div>
      <p className="pantone-hint" style={{ margin: 0 }}>
        {pedido.cliente} · creado {formatDate(pedido.created_at)}
        {pedido.created_by_nombre ? ` por ${pedido.created_by_nombre}` : ''}
      </p>

      <section className="card">
        <OrdenesDelPedido pedido={pedido} ordenes={ordenes} editable={editable} onCambio={cargar} />
      </section>

      {!pedido.es_mostrador && totales && (
        <section className="card">
          <h3 className="section-title section-title--small" style={{ margin: 0 }}>
            Cuenta del pedido
          </h3>
          <div className="totales-box" style={{ marginLeft: 0 }}>
            <div className="totales-box__row totales-box__row--total">
              <span>Total (suma de las órdenes)</span>
              <span>{formatMxn(totales.total)}</span>
            </div>
            <div className="totales-box__row">
              <span>Anticipo</span>
              <span>− {formatMxn(totales.anticipo)}</span>
            </div>
            <div className="totales-box__row">
              <span>Abonos</span>
              <span>− {formatMxn(totales.abonos)}</span>
            </div>
            {Number(totales.anticipos_ordenes) > 0 && (
              <div className="totales-box__row">
                <span>Anticipos registrados en las órdenes</span>
                <span>− {formatMxn(totales.anticipos_ordenes)}</span>
              </div>
            )}
            <div className="totales-box__row totales-box__row--saldo" style={{ color: totales.saldo > 0 ? 'var(--color-danger)' : 'var(--color-good)' }}>
              <span>Saldo</span>
              <span>{formatMxn(totales.saldo)}</span>
            </div>
          </div>
          {ordenes.some((o) => o.activa && o.lineas_sin_precio > 0) && (
            <p className="fin-missing" style={{ marginBottom: 0 }}>
              Hay órdenes con tallas sin precio: el total todavía no las incluye.
            </p>
          )}
        </section>
      )}

      {!pedido.es_mostrador && (
        <section className="card">
          <AbonosDelPedido
            pedido={pedido}
            abonos={abonos}
            puedeRegistrar={!eliminado && ROLES_ABONO.includes(role)}
            puedeBorrar={!eliminado && ROLES_BORRAR_ABONO.includes(role)}
            recibidoPorDefault={profile?.full_name || ''}
            onCambio={cargar}
          />
        </section>
      )}

      <section className="card">
        <DatosDelPedido pedido={pedido} editable={editable} onGuardado={cargar} />
      </section>

      {editable && vacio && (
        <button type="button" className="btn btn--ghost" onClick={handleEliminar} style={{ justifySelf: 'start' }}>
          Eliminar pedido
        </button>
      )}
    </div>
  )
}

function OrdenesDelPedido({ pedido, ordenes, editable, onCambio }) {
  const navigate = useNavigate()
  const [agregando, setAgregando] = useState(false)
  const [candidatas, setCandidatas] = useState([])
  const [elegida, setElegida] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!agregando) return
    fetchOrders().then(({ data }) => setCandidatas((data || []).filter((o) => !o.pedido_id && !o.cancelled_at && o.status !== 'completado')))
  }, [agregando])
  const ordenadas = useMemo(() => {
    const nombre = pedido.cliente.trim().toLowerCase()
    const mismo = (o) => (pedido.client_id && o.client_id === pedido.client_id) || String(o.client_name || '').trim().toLowerCase() === nombre
    return [...candidatas].sort((a, b) => Number(mismo(b)) - Number(mismo(a)) || String(a.order_number).localeCompare(String(b.order_number)))
  }, [candidatas, pedido])

  async function agregar() {
    if (!elegida) return
    setBusy(true)
    setError(null)
    const { error: err } = await agregarOrdenAPedido(pedido.id, elegida)
    setBusy(false)
    if (err) return setError(err)
    setElegida('')
    setAgregando(false)
    onCambio()
  }

  async function quitar(o) {
    if (!window.confirm(`¿Quitar la orden ${o.order_number} del pedido? Queda como orden suelta.`)) return
    setError(null)
    const { error: err } = await quitarOrdenDePedido(o.id)
    if (err) setError(err)
    onCambio()
  }

  return (
    <div>
      <div className="section-header">
        <h3 className="section-title section-title--small" style={{ marginBottom: 0 }}>
          Órdenes ({ordenes.length})
        </h3>
        {editable && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => navigate('/nueva', { state: { pedidoId: pedido.id } })}>
              + Nueva orden
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setAgregando((v) => !v)}>
              + Orden existente
            </button>
          </div>
        )}
      </div>

      {agregando && (
        <div className="pedido-agregar">
          <select className="input" value={elegida} onChange={(e) => setElegida(e.target.value)} aria-label="Orden para agregar">
            <option value="">Elige una orden sin pedido…</option>
            {ordenadas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_number} · {o.client_name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--primary btn--small" onClick={agregar} disabled={!elegida || busy}>
            {busy ? 'Agregando…' : 'Agregar'}
          </button>
          {pedido.es_mostrador && <p className="pantone-hint" style={{ margin: 0, flexBasis: '100%' }}>Al agregarla se vuelve venta de mostrador (sin precio ni factura).</p>}
        </div>
      )}
      {error && <p className="form-error">{error.message}</p>}

      {ordenes.length === 0 ? (
        <p className="page-subtitle" style={{ margin: '8px 0 0' }}>
          Este pedido todavía no tiene órdenes.
        </p>
      ) : (
        <div className="pedido-ordenes">
          {ordenes.map((o) => (
            <div key={o.id} className={'pedido-orden' + (o.activa ? '' : ' pedido-orden--inactiva')}>
              <div className="pedido-orden__main">
                <Link to={`/orden/${o.id}`}>
                  <b>{o.order_number}</b>
                </Link>
                <StatusBadge status={o.status} />
                {!o.activa && <span className="badge">Cancelada</span>}
                <span className="pantone-hint" style={{ margin: 0 }}>
                  Entrega {formatDate(o.requested_delivery_date)}
                </span>
              </div>
              <div className="pedido-orden__side">
                {!pedido.es_mostrador && <span className="pedido-orden__total">{formatMxn(o.total)}</span>}
                {!pedido.es_mostrador && o.lineas_sin_precio > 0 && <span className="fin-missing" style={{ margin: 0 }}>{o.lineas_sin_precio} sin precio</span>}
                {editable && (
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => quitar(o)}>
                    Quitar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AbonosDelPedido({ pedido, abonos, puedeRegistrar, puedeBorrar, recibidoPorDefault, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [recibidoPor, setRecibidoPor] = useState(recibidoPorDefault)
  const [notas, setNotas] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function registrar(e) {
    e.preventDefault()
    const n = Number(monto)
    if (!(n > 0)) return setError(new Error('El monto debe ser mayor a cero.'))
    if (!recibidoPor.trim()) return setError(new Error('Falta indicar quién recibió el abono.'))
    setBusy(true)
    setError(null)
    const { error: err } = await crearAbonoPedido({ pedidoId: pedido.id, monto: n, metodoPago: metodo, recibidoPor: recibidoPor.trim(), notas: notas.trim() })
    setBusy(false)
    if (err) return setError(err)
    setMonto('')
    setNotas('')
    setAbierto(false)
    onCambio()
  }

  async function borrar(a) {
    if (!window.confirm(`¿Borrar el abono de ${formatMxn(a.monto)}?`)) return
    const { error: err } = await borrarAbonoPedido(a.id)
    if (err) setError(err)
    onCambio()
  }

  const metodoLabel = (k) => METODOS_PAGO.find((m) => m.key === k)?.label || k

  return (
    <div>
      <div className="section-header">
        <h3 className="section-title section-title--small" style={{ marginBottom: 0 }}>
          Abonos
        </h3>
        {puedeRegistrar && !abierto && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setAbierto(true)}>
            + Registrar abono
          </button>
        )}
      </div>
      {Number(pedido.anticipo) > 0 && (
        <p className="pantone-hint" style={{ margin: '6px 0' }}>
          Anticipo al crear el pedido: <b>{formatMxn(pedido.anticipo)}</b>
          {pedido.anticipo_metodo_pago ? ` · ${metodoLabel(pedido.anticipo_metodo_pago)}` : ''}
          {pedido.anticipo_recibido_por ? ` · recibió ${pedido.anticipo_recibido_por}` : ''}
        </p>
      )}
      {abierto && (
        <form className="order-form" onSubmit={registrar} style={{ marginTop: 8 }}>
          <div className="form-row">
            <label>
              Monto *
              <input type="number" inputMode="decimal" min="0.01" step="0.01" className="input" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </label>
            <label>
              Método de pago
              <select className="input" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                {METODOS_PAGO.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Quién lo recibió *
              <input type="text" className="input" value={recibidoPor} onChange={(e) => setRecibidoPor(e.target.value)} />
            </label>
            <label>
              Notas
              <input type="text" className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar abono'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {error && <p className="form-error">{error.message}</p>}
      {abonos.length === 0 ? (
        <p className="page-subtitle" style={{ margin: '8px 0 0' }}>
          Todavía no hay abonos.
        </p>
      ) : (
        <div className="pedido-abonos">
          {abonos.map((a) => (
            <div key={a.id} className="pedido-abono">
              <div>
                <b>{formatMxn(a.monto)}</b> · {metodoLabel(a.metodo_pago)}
                <div className="pantone-hint" style={{ margin: 0 }}>
                  {formatDateTime(a.created_at)} · recibió {a.recibido_por}
                  {a.notas ? ` · ${a.notas}` : ''}
                </div>
              </div>
              {puedeBorrar && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => borrar(a)}>
                  Borrar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DatosDelPedido({ pedido, editable, onGuardado }) {
  const [f, setF] = useState(() => pedidoAFormulario(pedido))
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    setF(pedidoAFormulario(pedido))
    setDirty(false)
  }, [pedido])

  async function guardar() {
    const falta = errorPedido(f)
    if (falta) return setError(new Error(falta))
    if (f.esMostrador && !pedido.es_mostrador && !window.confirm('Todas las órdenes del pedido quedarán como venta de mostrador: se borran sus precios y su factura. ¿Continuar?')) return
    setBusy(true)
    setError(null)
    const { error: err } = await actualizarPedido(pedido.id, datosParaGuardar(f))
    setBusy(false)
    if (err) return setError(err)
    onGuardado()
  }

  return (
    <div>
      <h3 className="section-title section-title--small" style={{ margin: '0 0 8px' }}>
        Datos del pedido
      </h3>
      <div className="order-form">
        <PedidoDatosForm
          value={f}
          disabled={!editable}
          onChange={(v) => {
            setF(v)
            setDirty(true)
          }}
        />
        <label>
          Notas
          <input
            type="text"
            className="input"
            value={f.notas}
            disabled={!editable}
            onChange={(e) => {
              setF({ ...f, notas: e.target.value })
              setDirty(true)
            }}
          />
        </label>
      </div>
      {error && <p className="form-error">{error.message}</p>}
      {editable && (
        <button type="button" className="btn btn--primary" style={{ marginTop: 10 }} onClick={guardar} disabled={busy || !dirty}>
          {busy ? 'Guardando…' : 'Guardar datos del pedido'}
        </button>
      )}
    </div>
  )
}
