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
                {tallero.prestado_a} (prestó {tallero.prestado_por}, {fmtFecha(tallero.prestado_desde)})
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
        Historial
      </h3>
      {movimientos.length === 0 ? (
        <p className="template-hint">Sin movimientos todavía.</p>
      ) : (
        <ul className="tallero-timeline">
          {movimientos.map((m) => (
            <li key={m.id}>
              <b>{TIPO_LABEL[m.tipo] || m.tipo}</b> · {fmtFecha(m.fecha)}
              <div className="template-hint">
                {m.tipo === 'prestamo' && `${m.persona_equipo} lo prestó a ${m.persona_externa}`}
                {m.tipo === 'devolucion' && `${m.persona_externa ? `${m.persona_externa} lo devolvió; ` : ''}lo recibió ${m.persona_equipo}`}
                {m.tipo === 'ajuste' && `${m.estado_anterior} → ${m.estado_nuevo}`}
                {m.orders?.order_number ? ` · Orden #${m.orders.order_number}` : ''}
                {m.notas ? ` · ${m.notas}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal === 'prestar' && <PrestarModal tallero={tallero} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'devolver' && <DevolverModal tallero={tallero} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'form' && <TalleroFormModal tallero={tallero} productos={productos} onClose={() => setModal(null)} onDone={done} />}
    </div>
  )
}
