import { Link } from 'react-router-dom'
import TalleroEstadoBadge from './TalleroEstadoBadge'

export function fmtFecha(ts) {
  return ts ? new Date(ts).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

// V63 — tarjeta de un tallero en el listado. Los botones que se muestran
// dependen del rol (los decide la página vía `can*`).
export default function TalleroCard({ t, canLoan, canManage, onPrestar, onDevolver, onEditar, onBaja }) {
  return (
    <div className="card tallero-card">
      <Link to={`/talleros/${t.id}`} className="tallero-card__photo">
        {t.foto_url ? <img src={t.foto_url} alt={`${t.codigo}`} loading="lazy" /> : <span>Sin foto</span>}
      </Link>
      <div className="tallero-card__body">
        <div className="tallero-card__top">
          <Link to={`/talleros/${t.id}`} className="tallero-card__title">
            {t.codigo} · {t.mt_productos?.nombre}
          </Link>
          <TalleroEstadoBadge estado={t.estado_uso} />
        </div>
        <p className="tallero-card__meta">
          {[t.color, t.tallas && `T. ${t.tallas}`].filter(Boolean).join(' · ') || '—'}
        </p>
        {t.estado_contenido === 'incompleto' && (
          <p className="tallero-card__warn">
            Incompleto{t.tallas_faltantes ? ` — faltan ${t.tallas_faltantes}` : ''}
          </p>
        )}
        {t.estado_uso === 'prestado' && (
          <p className="tallero-card__meta">
            Con <b>{t.prestado_a}</b> desde {fmtFecha(t.prestado_desde)}
          </p>
        )}
        <div className="tallero-card__actions">
          {canLoan && t.estado_uso === 'disponible' && (
            <button type="button" className="btn btn--primary btn--small" onClick={() => onPrestar(t)}>
              Prestar
            </button>
          )}
          {canLoan && t.estado_uso === 'prestado' && (
            <button type="button" className="btn btn--primary btn--small" onClick={() => onDevolver(t)}>
              Devolver
            </button>
          )}
          {canManage && (
            <>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => onEditar(t)}>
                Editar
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => onBaja(t)} disabled={t.estado_uso === 'prestado'}>
                Dar de baja
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
