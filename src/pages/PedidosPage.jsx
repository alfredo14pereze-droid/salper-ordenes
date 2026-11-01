import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState } from '../components/common/States'
import PedidoDatosForm from '../components/pedidos/PedidoDatosForm'
import { useAuth } from '../contexts/AuthContext'
import { canEditFinanzas, canViewFinanzas } from '../utils/permissions'
import { formatMxn } from '../services/finanzasService'
import { crearPedido, fetchPedidosLista } from '../services/pedidosService'
import { PEDIDO_VACIO, datosParaGuardar, errorPedido } from '../utils/pedidos'
import { formatDate } from '../utils/dates'

// V176 — lista de pedidos (varias órdenes de un cliente con un anticipo,
// abonos y factura). Lo normal es crearlos desde "Nueva orden"; aquí también
// se puede abrir uno vacío para luego agregarle órdenes que ya existen.
export default function PedidosPage() {
  return (
    <RequireRole allow={canViewFinanzas}>
      <PedidosContent />
    </RequireRole>
  )
}

function PedidosContent() {
  const { role, profile } = useAuth()
  const navigate = useNavigate()
  const [pedidos, setPedidos] = useState(null)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [nuevo, setNuevo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [nuevoError, setNuevoError] = useState(null)

  useEffect(() => {
    fetchPedidosLista().then(({ data, error: err }) => {
      setPedidos(data || [])
      setError(err)
    })
  }, [])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return pedidos || []
    return (pedidos || []).filter((p) => `${p.folio} ${p.cliente}`.toLowerCase().includes(q))
  }, [pedidos, busqueda])

  async function crear() {
    const falta = errorPedido(nuevo)
    if (falta) return setNuevoError(new Error(falta))
    setBusy(true)
    setNuevoError(null)
    const { data, error: err } = await crearPedido(datosParaGuardar(nuevo), [])
    setBusy(false)
    if (err) return setNuevoError(err)
    navigate(`/pedido/${data.id}`)
  }

  if (!pedidos) return <Loading />
  if (error) return <ErrorState error={error} />

  return (
    <div className="page page--narrow pedido-page">
      <div className="section-header">
        <h2 className="section-title" style={{ margin: 0 }}>
          Pedidos
        </h2>
        {canEditFinanzas(role) && !nuevo && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setNuevo({ ...PEDIDO_VACIO, anticipoRecibidoPor: profile?.full_name || '' })}>
            + Pedido vacío
          </button>
        )}
      </div>
      <p className="pantone-hint" style={{ margin: 0 }}>
        Un pedido junta varias órdenes de un cliente con un solo anticipo, abonos y factura. Se crea desde "Nueva orden" →
        "Nuevo pedido".
      </p>

      {nuevo && (
        <section className="card">
          <h3 className="section-title section-title--small" style={{ margin: '0 0 8px' }}>
            Pedido vacío
          </h3>
          <div className="order-form">
            <PedidoDatosForm value={nuevo} onChange={setNuevo} />
          </div>
          {nuevoError && <p className="form-error">{nuevoError.message}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn--primary" onClick={crear} disabled={busy}>
              {busy ? 'Creando…' : 'Crear pedido'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setNuevo(null)}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      <input type="search" className="input" placeholder="Buscar por folio o cliente" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />

      {filtrados.length === 0 ? (
        <p className="page-subtitle" style={{ margin: 0 }}>
          {pedidos.length === 0 ? 'Todavía no hay pedidos.' : 'Ningún pedido coincide con la búsqueda.'}
        </p>
      ) : (
        <div className="pedido-ordenes">
          {filtrados.map((p) => (
            <Link key={p.id} to={`/pedido/${p.id}`} className="pedido-orden pedido-orden--link">
              <div className="pedido-orden__main">
                <b>{p.folio}</b>
                <span>{p.cliente}</span>
                {p.es_mostrador && <span className="badge badge--mostrador">Mostrador</span>}
                <span className="pantone-hint" style={{ margin: 0 }}>
                  {p.ordenes} {p.ordenes === 1 ? 'orden' : 'órdenes'} · {formatDate(p.created_at)}
                </span>
              </div>
              {!p.es_mostrador && (
                <div className="pedido-orden__side">
                  <span className="pantone-hint" style={{ margin: 0 }}>
                    Total {formatMxn(p.total)}
                  </span>
                  <span className="pedido-orden__total" style={{ color: Number(p.saldo) > 0 ? 'var(--color-danger)' : 'var(--color-good)' }}>
                    Saldo {formatMxn(p.saldo)}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
