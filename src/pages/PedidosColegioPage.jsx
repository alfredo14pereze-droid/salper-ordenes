import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { usePedidosColegio } from '../hooks/usePedidosColegio'
import { createColegio } from '../services/pedidosColegioService'
import { canManagePedidosColegio } from '../utils/permissions'
import { formatDate } from '../utils/dates'
import { formatMonto, calcSaldo } from '../utils/pedidosColegio'

// V57 — Pedidos Colegio (BETA, solo admin_general). Lista de colegios,
// cada uno expandible a sus pedidos, con el saldo pendiente de cada uno.
export default function PedidosColegioPage() {
  return (
    <RequireRole allow={canManagePedidosColegio}>
      <PedidosColegioContent />
    </RequireRole>
  )
}

function AddColegioForm({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error: createError } = await createColegio(nombre, codigo)
    setSaving(false)
    if (createError) {
      setError(createError)
      return
    }
    setNombre('')
    setCodigo('')
    setOpen(false)
    onCreated()
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--secondary btn--small" onClick={() => setOpen(true)}>
        + Agregar colegio
      </button>
    )
  }

  return (
    <form className="order-form card" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Nombre del colegio *
          <input type="text" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </label>
        <label>
          Código de folio * (1 a 6 letras)
          <input
            type="text"
            className="input"
            value={codigo}
            maxLength={6}
            placeholder="Ej. IT"
            onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          />
        </label>
      </div>
      <p className="pantone-hint">El folio de cada pedido será este código + un consecutivo (ej. IT1, IT2…).</p>
      {error && <p className="form-error">{error.message}</p>}
      <div className="order-form__actions">
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving || !nombre.trim() || !codigo}>
          {saving ? 'Guardando…' : 'Guardar colegio'}
        </button>
      </div>
    </form>
  )
}

function PedidosColegioContent() {
  const { colegios, pedidos, loading, error, refresh } = usePedidosColegio()
  const [expanded, setExpanded] = useState(() => new Set())

  const pedidosByColegio = useMemo(() => {
    const map = new Map()
    for (const p of pedidos) {
      if (!map.has(p.colegio_id)) map.set(p.colegio_id, [])
      map.get(p.colegio_id).push(p)
    }
    return map
  }, [pedidos])

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) return <Loading label="Cargando pedidos de colegio…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page">
      <div className="section-header">
        <h2 className="section-title">
          Pedidos Colegio <span className="badge badge--outline">Beta</span>
        </h2>
        <AddColegioForm onCreated={refresh} />
      </div>
      <p className="page-subtitle">
        Solo visible para administrador general. Cada pedido lleva folio por colegio y su recibo en PDF.
      </p>

      {colegios.length === 0 ? (
        <EmptyState>Todavía no hay colegios dados de alta.</EmptyState>
      ) : (
        <div className="document-list">
          {colegios.map((colegio) => {
            const lista = pedidosByColegio.get(colegio.id) || []
            const saldoTotal = lista.reduce((sum, p) => sum + calcSaldo(p, p.colegio_pedido_abonos), 0)
            const isOpen = expanded.has(colegio.id)
            return (
              <section key={colegio.id} className="card">
                <div className="section-header" style={{ marginBottom: isOpen ? 12 : 0 }}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ textAlign: 'left', flex: 1, justifyContent: 'flex-start' }}
                    onClick={() => toggle(colegio.id)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? '▾' : '▸'} <strong>{colegio.nombre}</strong>{' '}
                    <span className="badge badge--outline">{colegio.codigo_folio}</span>{' '}
                    <span className="section-count">
                      {lista.length} pedido{lista.length === 1 ? '' : 's'}
                      {saldoTotal > 0 ? ` · ${formatMonto(saldoTotal)} por cobrar` : ''}
                    </span>
                  </button>
                  <Link to={`/pedidos-colegio/nuevo?colegio=${colegio.id}`} className="btn btn--primary btn--small">
                    + Nuevo pedido
                  </Link>
                </div>

                {isOpen &&
                  (lista.length === 0 ? (
                    <p className="pantone-hint">Este colegio todavía no tiene pedidos.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="simple-table">
                        <thead>
                          <tr>
                            <th>Folio</th>
                            <th>Cliente</th>
                            <th>Fecha</th>
                            <th style={{ textAlign: 'right' }}>Subtotal</th>
                            <th style={{ textAlign: 'right' }}>Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lista.map((p) => {
                            const saldo = calcSaldo(p, p.colegio_pedido_abonos)
                            return (
                              <tr key={p.id}>
                                <td>
                                  <Link to={`/pedidos-colegio/${p.id}`} style={{ color: 'var(--color-text)' }}>
                                    <strong>{p.folio}</strong>
                                  </Link>
                                </td>
                                <td>
                                  {p.cliente_nombre}
                                  {p.cliente_referencia ? ` · ${p.cliente_referencia}` : ''}
                                </td>
                                <td>{formatDate(p.fecha_pedido)}</td>
                                <td style={{ textAlign: 'right' }}>{formatMonto(p.subtotal)}</td>
                                <td
                                  style={{
                                    textAlign: 'right',
                                    fontWeight: 700,
                                    color: saldo > 0 ? 'var(--color-danger)' : 'var(--color-good)',
                                  }}
                                >
                                  {formatMonto(saldo)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
