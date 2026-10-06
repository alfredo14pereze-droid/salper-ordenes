import { Link } from 'react-router-dom'
import { SIGUIENTE, sinRecibirAlerta, urgenciaFecha, diasEsperandoEntrega, partesDe, partesFaltantes, textoBaja } from '../../services/pendientesService'
import { formatDate, formatDateTime } from '../../utils/dates'
import { resumenPrendas, textoPago } from '../../utils/pendientesPago'

// Tarjeta de un pendiente. Móvil primero: el botón de confirmar es grande y de
// un solo toque; la casilla permite confirmar varios en bloque.
//
// V94 — un pendiente de cliente ya no se pinta como "cerrado" al llegar a
// recibido_en_tienda (todavía falta entregarlo): eso se resalta en rojo
// pasados 7 días esperando (misma señal visual que sinRecibirAlerta), y solo
// se dimea con pf-card--cerrado cuando de verdad terminó (entregado, o
// recibido_en_tienda de un pendiente que se queda en la tienda).
export default function PendienteCard({ p, puedeActuar, puedeEntregar, selected, onToggle, onConfirm, onEntregar, busy }) {
  const sig = SIGUIENTE[p.estado]
  const urg = urgenciaFecha(p)
  const alerta = sinRecibirAlerta(p)
  const diasEsperando = diasEsperandoEntrega(p)
  const esperandoMucho = diasEsperando !== null && diasEsperando > 7
  let cls = 'pf-card'
  if (alerta || urg?.nivel === 'rojo' || esperandoMucho) cls += ' pf-card--rojo'
  else if (urg?.nivel === 'amarillo') cls += ' pf-card--amarillo'
  if (p.estado === 'entregado' || p.estado === 'mercancia_recibida' || (p.estado === 'recibido_en_tienda' && !p.es_para_cliente)) cls += ' pf-card--cerrado'

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
        </div>
        <Link to={`/pendientes/${p.id}`} className="pf-card__desc">
          {p.descripcion}
        </Link>
        <div className="pf-card__meta">
          <span>{resumenPrendas(p)}</span>
          {/* V134 — tipo compuesto: qué parte falta mientras está por hacer. */}
          {p.estado === 'recibido_en_fabrica' && partesDe(p).length > 0 && (
            <span>{partesFaltantes(p).length > 0 ? `Falta: ${partesFaltantes(p).join(' y ')}` : 'Todo listo'}</span>
          )}
          {textoBaja(p) && <span>Inventario: {textoBaja(p)}</span>}
          {p.es_para_cliente ? (
            <span>{textoPago(p)}</span>
          ) : (
            <span>{p.inventariado === null ? 'Inventariado: —' : p.inventariado ? 'Inventariado' : 'No inventariado'}</span>
          )}
          {p.es_para_cliente ? (
            <span>
              👤 {p.cliente_nombre} · {p.cliente_telefono}
            </span>
          ) : (
            <span>Se queda en la tienda</span>
          )}
          {p.fecha_requerida ? (
            <span className={'pf-due' + (urg?.nivel ? ` pf-due--${urg.nivel}` : '')}>
              Regresa {formatDate(p.fecha_requerida)}
              {urg ? ` · ${urg.label}` : ''}
            </span>
          ) : (
            <span>Enviado {formatDate(p.created_at)}</span>
          )}
          {diasEsperando !== null && (
            <span className={esperandoMucho ? 'pf-due pf-due--rojo' : undefined}>
              Lleva {diasEsperando} día{diasEsperando === 1 ? '' : 's'} esperando
            </span>
          )}
          {p.estado === 'entregado' && (
            <span className="badge badge--status-entregado">
              Entregado {formatDateTime(p.entregado_en)}
              {p.recogio && ` · ${p.recogio}`}
            </span>
          )}
          {p.creado_por_nombre && <span>Creado por: {p.creado_por_nombre}</span>}
        </div>
        {alerta && <p className="pf-alerta">⚠ Enviado a fábrica y sin recibir desde hace más de 1 día</p>}
      </div>
      {puedeActuar && sig && (
        <button type="button" className="btn btn--primary pf-card__btn" disabled={busy} onClick={() => onConfirm(p)}>
          {sig.label}
        </button>
      )}
      {puedeEntregar && p.estado === 'recibido_en_tienda' && p.es_para_cliente && (
        <button type="button" className="btn btn--primary pf-card__btn" disabled={busy} onClick={() => onEntregar(p)}>
          Marcar como entregado
        </button>
      )}
    </article>
  )
}
