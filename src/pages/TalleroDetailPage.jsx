import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState } from '../components/common/States'
import { useTallero, useTalleros } from '../hooks/useTalleros'
import { useAuth } from '../contexts/AuthContext'
import { canViewTalleros, canLoanTalleros, canManageTalleros } from '../utils/permissions'
import { darDeBajaTallero, UBICACIONES } from '../services/tallerosService'
import TalleroEstadoBadge from '../components/talleros/TalleroEstadoBadge'
import { fmtFecha } from '../components/talleros/TalleroCard'
import PrestarModal from '../components/talleros/PrestarModal'
import DevolverModal from '../components/talleros/DevolverModal'
import TalleroFormModal from '../components/talleros/TalleroFormModal'

export default function TalleroDetailPage() {
  return (
    <RequireRole allow={canViewTalleros}>
      <TalleroDetail />
    </RequireRole>
  )
}

const TIPO_LABEL = { prestamo: 'Préstamo', devolucion: 'Devolución', ajuste: 'Ajuste' }

function TalleroDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role } = useAuth()
  const canLoan = canLoanTalleros(role)
  const canManage = canManageTalleros(role)
  const { tallero, movimientos, loading, error, refresh } = useTallero(id)
  const { productos } = useTalleros()
  const [modal, setModal] = useState(null)
  const [actionError, setActionError] = useState(null)

  if (loading) return <Loading label="Cargando tallero…" />
  if (error || !tallero) return <ErrorState error={error || new Error('Tallero no encontrado.')} onRetry={refresh} />

  async function handleBaja() {
    if (!window.confirm(`¿Dar de baja ${tallero.codigo}? Su historial se conserva.`)) return
    const { error: err } = await darDeBajaTallero(tallero.id)
    if (err) return setActionError(err)
    navigate('/talleros')
  }

  function done() {
    setModal(null)
    refresh()
  }

  const ubicacion = UBICACIONES.find((u) => u.key === tallero.ubicacion)?.label

  return (
    <div className="page page--narrow">
      <Link to="/talleros" className="template-hint">
        ← Talleros
      </Link>
      <div className="new-order-header" style={{ marginTop: 8 }}>
        <h2 className="section-title">
          {tallero.codigo} · {tallero.mt_productos?.nombre}
        </h2>
        <TalleroEstadoBadge estado={tallero.estado_uso} />
      </div>

      {tallero.foto_url && <img src={tallero.foto_url} alt={tallero.codigo} className="tallero-detail__photo" />}

      <div className="card tallero-detail__info">
        <dl>
          <dt>Color</dt>
          <dd>{tallero.color || '—'}</dd>
          <dt>Tallas que trae</dt>
          <dd>{tallero.tallas || '—'}</dd>
          <dt>Contenido</dt>
          <dd>
            {tallero.estado_contenido === 'completo' ? 'Completo' : `Incompleto${tallero.tallas_faltantes ? ` — faltan ${tallero.tallas_faltantes}` : ''}`}
          </dd>
          <dt>Tela</dt>
          <dd>{tallero.tela || '—'}</dd>
          <dt>Ubicación</dt>
          <dd>{[ubicacion, tallero.estanteria].filter(Boolean).join(' · ') || '—'}</dd>
          {tallero.estado_uso === 'prestado' && (
            <>
              <dt>Lo tiene</dt>
              <dd>
                <b>{tallero.prestado_a}</b> (prestó {tallero.prestado_por}, {fmtFecha(tallero.prestado_desde)})
                {tallero.tallas_prestadas ? ` — solo tallas: ${tallero.tallas_prestadas}` : ''}
              </dd>
            </>
          )}
          {tallero.estado_uso === 'prestado' && (tallero.prestado_telefono || tallero.prestado_deposito > 0) && (
            <>
              <dt>Contacto y dinero</dt>
              <dd>
                {tallero.prestado_telefono ? `Tel. ${tallero.prestado_telefono}` : 'Sin teléfono'}
                {tallero.prestado_deposito > 0 ? ` · Dejó $${Number(tallero.prestado_deposito).toLocaleString('es-MX')}` : ''}
              </dd>
            </>
          )}
          {tallero.observaciones && (
            <>
              <dt>Observaciones</dt>
              <dd>{tallero.observaciones}</dd>
            </>
          )}
        </dl>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        {canLoan && tallero.estado_uso === 'disponible' && (
          <button type="button" className="btn btn--primary" onClick={() => setModal('prestar')}>
            Prestar
          </button>
        )}
        {canLoan && tallero.estado_uso === 'disponible' && (
          <button type="button" className="btn btn--secondary" onClick={() => setModal('prestar-parcial')}>
            Prestar parcial
          </button>
        )}
        {canLoan && tallero.estado_uso === 'prestado' && (
          <button type="button" className="btn btn--primary" onClick={() => setModal('devolver')}>
            Devolver
          </button>
        )}
        {canManage && (
          <>
            <button type="button" className="btn btn--secondary" onClick={() => setModal('form')}>
              Editar
            </button>
            <button type="button" className="btn btn--ghost" onClick={handleBaja} disabled={tallero.estado_uso === 'prestado'}>
              Dar de baja
            </button>
          </>
        )}
      </div>
      {actionError && <p className="form-error">{actionError.message}</p>}

      <h3 className="section-title" style={{ fontSize: 16 }}>
        Historial de préstamos
      </h3>
      <p className="template-hint">Quién lo prestó, a quién y cuándo — para saber a quién preguntar si hay un problema.</p>
      {movimientos.length === 0 ? (
        <p className="template-hint">Sin movimientos todavía.</p>
      ) : (
        <div className="revision__tabla-wrap">
          <table className="simple-table tallero-historial">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Movimiento</th>
                <th>Lo prestó / recibió</th>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th>Dinero</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td>{fmtFecha(m.fecha)}</td>
                  <td>
                    <b>{TIPO_LABEL[m.tipo] || m.tipo}</b>
                  </td>
                  <td>{m.persona_equipo || '—'}</td>
                  <td>{m.persona_externa || (m.tipo === 'ajuste' ? '' : '—')}</td>
                  <td>{m.telefono || '—'}</td>
                  <td>
                    {m.deposito > 0 ? `${m.tipo === 'devolucion' ? 'Devuelto ' : 'Dejó '}$${Number(m.deposito).toLocaleString('es-MX')}` : '—'}
                  </td>
                  <td>
                    {m.tipo === 'ajuste' && `${m.estado_anterior} → ${m.estado_nuevo}`}
                    {m.tallas ? `${m.tipo === 'prestamo' ? 'Parcial: ' : 'Tallas: '}${m.tallas}` : ''}
                    {m.orders?.order_number ? ` Orden #${m.orders.order_number}` : ''}
                    {m.notas ? ` ${m.notas}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(modal === 'prestar' || modal === 'prestar-parcial') && (
        <PrestarModal tallero={tallero} parcial={modal === 'prestar-parcial'} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal === 'devolver' && <DevolverModal tallero={tallero} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'form' && <TalleroFormModal tallero={tallero} productos={productos} onClose={() => setModal(null)} onDone={done} />}
    </div>
  )
}
