import { Link } from 'react-router-dom'
import { ESTADOS, SIGUIENTE, sinRecibirAlerta, urgenciaFecha } from '../../services/pendientesService'
import { formatDate } from '../../utils/dates'

// Tarjeta de un pendiente. Móvil primero: el botón de confirmar es grande y de
// un solo toque; la casilla permite confirmar varios en bloque.
export default function PendienteCard({ p, puedeActuar, selected, onToggle, onConfirm, busy }) {
  const sig = SIGUIENTE[p.estado]
  const urg = urgenciaFecha(p)
  const alerta = sinRecibirAlerta(p)
  let cls = 'pf-card'
  if (alerta || urg?.nivel === 'rojo') cls += ' pf-card--rojo'
  else if (urg?.nivel === 'amarillo') cls += ' pf-card--amarillo'
  if (p.estado === 'con_problema') cls += ' pf-card--problema'
  if (p.estado === 'recibido_en_tienda') cls += ' pf-card--cerrado'

  return (
    <article className={cls}>
      {puedeActuar && sig && (
        <label className="pf-card__check" aria-label={`Seleccionar ${p.folio}`}>
          <input type="checkbox" checked={!!selected} onChange={() => onToggle(p.id)} />
        </label>
      )}
      <div className="pf-card__body">
        <div className="pf-card__top">
          <Link to={`/pendientes/${p.id}`} className="pf-card__folio">
            {p.folio}
          </Link>
          <span className="badge badge--outline">{p.tipo?.nombre}</span>
          <span className="pf-card__qty">× {p.cantidad}</span>
          {p.estado === 'con_problema' && <span className="badge badge--danger">Con problema</span>}
        </div>
        <Link to={`/pendientes/${p.id}`} className="pf-card__desc">
          {p.descripcion}
        </Link>
        <div className="pf-card__meta">
          {p.es_para_cliente ? (
            <span>
              👤 {p.cliente_nombre} · {p.cliente_telefono} · {p.prenda} talla {p.talla}
            </span>
          ) : (
            <span>Se queda en la tienda</span>
          )}
          {p.orden?.order_number && <span>Orden #{p.orden.order_number}</span>}
          <span className={'pf-due' + (urg?.nivel ? ` pf-due--${urg.nivel}` : '')}>
            Regresa {formatDate(p.fecha_requerida)}
            {urg ? ` · ${urg.label}` : ''}
          </span>
        </div>
        {alerta && <p className="pf-alerta">⚠ Enviado a fábrica y sin recibir desde hace más de 1 día</p>}
        {p.estado === 'con_problema' && <p className="pf-card__meta">Estaba en: {ESTADOS[p.estado_previo]?.label}</p>}
      </div>
      {puedeActuar && sig && (
        <button type="button" className="btn btn--primary pf-card__btn" disabled={busy} onClick={() => onConfirm(p)}>
          {sig.label}
        </button>
      )}
    </article>
  )
}
