import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { diasEntre, estaAbierto, sumarDias, tipoActividad } from '../../utils/crm'
import { formatDate } from '../../utils/dates'
import { EstatusBadge, telLink, waLink } from './CrmComunes'

const MOSTRAR_SIN = 12

// Parte 2 — "A quién le toca hoy": seguimientos vencidos, de hoy y de los
// próximos 7 días, más los prospectos abiertos que no tienen ninguno.
// filas: [{ e, principal, proximo }] de la página; datos: lo de fetchCrmLista.
export default function CrmPanel({ filas, datos, usuarios, userId, puedeVerTodos, hoy, onRegistrar }) {
  const [quien, setQuien] = useState('mios') // mios | sin | todos
  const [verTodosSin, setVerTodosSin] = useState(false)

  const porEmpresa = useMemo(() => new Map(filas.map((f) => [f.e.id, f])), [filas])
  const ultimaAct = useMemo(() => {
    const m = new Map()
    for (const a of datos.actividades) {
      const prev = m.get(a.empresa_id)
      if (!prev || a.fecha > prev.fecha || (a.fecha === prev.fecha && a.creado_en > prev.creado_en)) m.set(a.empresa_id, a)
    }
    return m
  }, [datos.actividades])

  const toca = (asignado) => (quien === 'todos' ? true : quien === 'sin' ? !asignado : asignado === userId)
  const semana = sumarDias(hoy, 7)

  const segs = datos.seguimientos.filter((s) => porEmpresa.has(s.empresa_id) && toca(s.asignado_a))
  const vencidos = segs.filter((s) => s.fecha < hoy)
  const deHoy = segs.filter((s) => s.fecha === hoy)
  const estaSemana = segs.filter((s) => s.fecha > hoy && s.fecha <= semana)
  const conPendiente = new Set(datos.seguimientos.map((s) => s.empresa_id))
  const sinSeguimiento = filas.filter((f) => estaAbierto(f.e.estatus) && !conPendiente.has(f.e.id) && toca(f.e.responsable_id))

  // Cuántos hay en las otras opciones, para que "Míos" vacío no confunda.
  const cuenta = (q) => {
    const t = (a) => (q === 'todos' ? true : q === 'sin' ? !a : a === userId)
    return (
      datos.seguimientos.filter((s) => porEmpresa.has(s.empresa_id) && t(s.asignado_a) && s.fecha <= semana).length +
      filas.filter((f) => estaAbierto(f.e.estatus) && !conPendiente.has(f.e.id) && t(f.e.responsable_id)).length
    )
  }
  const opciones = [
    { key: 'mios', label: 'Míos' },
    { key: 'sin', label: 'Sin asignar' },
    ...(puedeVerTodos ? [{ key: 'todos', label: 'Todos' }] : []),
  ]
  const nada = vencidos.length + deHoy.length + estaSemana.length + sinSeguimiento.length === 0

  const tarjeta = (s) => {
    const f = porEmpresa.get(s.empresa_id)
    return <Tarjeta key={s.id} fila={f} seg={s} ultima={ultimaAct.get(s.empresa_id)} usuarios={usuarios} hoy={hoy} mostrarQuien={quien !== 'mios'} onRegistrar={() => onRegistrar(f, s)} />
  }

  return (
    <div className="crm-panel">
      <div className="crm-panel__quien">
        {opciones.map((o) => (
          <button key={o.key} type="button" className={'chip' + (quien === o.key ? ' chip--active' : '')} onClick={() => setQuien(o.key)}>
            {o.label} ({cuenta(o.key)})
          </button>
        ))}
      </div>

      {nada && (
        <div className="crm-panel__vacio">
          {quien === 'mios' ? (
            <>
              <p>
                <strong>No tienes seguimientos para esta semana.</strong> 🎉
              </p>
              {cuenta('sin') > 0 && (
                <p className="crm-muted">
                  Hay {cuenta('sin')} sin asignar.{' '}
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setQuien('sin')}>
                    Ver los sin asignar
                  </button>
                </p>
              )}
            </>
          ) : (
            <p className="crm-muted">Nada pendiente aquí.</p>
          )}
        </div>
      )}

      {vencidos.length > 0 && (
        <Seccion titulo="Vencidos" n={vencidos.length} clase="crm-sec--vencidos">
          {vencidos.map(tarjeta)}
        </Seccion>
      )}
      {deHoy.length > 0 && (
        <Seccion titulo="Hoy" n={deHoy.length} clase="crm-sec--hoy">
          {deHoy.map(tarjeta)}
        </Seccion>
      )}
      {estaSemana.length > 0 && (
        <Seccion titulo="Esta semana" n={estaSemana.length} clase="crm-sec--semana">
          {estaSemana.map(tarjeta)}
        </Seccion>
      )}
      {sinSeguimiento.length > 0 && (
        <Seccion
          titulo="Sin seguimiento"
          n={sinSeguimiento.length}
          clase="crm-sec--sin"
          ayuda="Prospectos abiertos sin fecha para volver a contactar: son los que se enfrían."
        >
          {(verTodosSin ? sinSeguimiento : sinSeguimiento.slice(0, MOSTRAR_SIN)).map((f) => (
            <Tarjeta key={f.e.id} fila={f} ultima={ultimaAct.get(f.e.id)} usuarios={usuarios} hoy={hoy} mostrarQuien={quien !== 'mios'} onRegistrar={() => onRegistrar(f, null)} />
          ))}
          {!verTodosSin && sinSeguimiento.length > MOSTRAR_SIN && (
            <button type="button" className="btn btn--secondary btn--small crm-panel__mas" onClick={() => setVerTodosSin(true)}>
              Ver los {sinSeguimiento.length - MOSTRAR_SIN} restantes
            </button>
          )}
        </Seccion>
      )}
    </div>
  )
}

function Seccion({ titulo, n, clase, ayuda, children }) {
  return (
    <section className={'crm-sec ' + clase}>
      <h3 className="crm-sec__titulo">
        {titulo} <span className="crm-sec__n">{n}</span>
      </h3>
      {ayuda && <p className="crm-muted crm-sec__ayuda">{ayuda}</p>}
      <div className="crm-sec__tarjetas">{children}</div>
    </section>
  )
}

function Tarjeta({ fila, seg, ultima, usuarios, hoy, mostrarQuien, onRegistrar }) {
  const { e, principal } = fila
  const atraso = seg && seg.fecha < hoy ? diasEntre(seg.fecha, hoy) : 0
  const t = ultima ? tipoActividad(ultima.tipo) : null
  const quien = seg ? seg.asignado_a : e.responsable_id
  return (
    <article className="crm-ptarjeta">
      <div className="crm-ptarjeta__top">
        <Link to={`/crm/${e.id}`} className="crm-ptarjeta__nombre">
          {e.nombre}
        </Link>
        <EstatusBadge estatus={e.estatus} />
      </div>
      {seg && (
        <p className={'crm-ptarjeta__seg' + (atraso ? ' crm-vencido' : '')}>
          🕑 {seg.fecha === hoy ? 'Hoy' : formatDate(seg.fecha, "EEE d 'de' MMM")}
          {atraso ? ` · hace ${atraso} día${atraso === 1 ? '' : 's'}` : ''}
          {seg.nota ? <span className="crm-ptarjeta__nota"> — {seg.nota}</span> : null}
        </p>
      )}
      {principal ? (
        <div className="crm-ptarjeta__contacto">
          <span>
            <strong>{principal.nombre}</strong>
            {principal.puesto ? <span className="crm-muted"> · {principal.puesto}</span> : null}
          </span>
          <span className="crm-ptarjeta__medios">
            {principal.telefono && (
              <a href={telLink(principal.telefono)} className="crm-medio" title={`Llamar ${principal.telefono}`}>
                📞 {principal.telefono}
              </a>
            )}
            {principal.telefono && waLink(principal.telefono) && (
              <a href={waLink(principal.telefono)} target="_blank" rel="noreferrer" className="crm-medio">
                💬 WhatsApp
              </a>
            )}
            {principal.correo && (
              <a href={`mailto:${principal.correo}`} className="crm-medio">
                ✉️ {principal.correo}
              </a>
            )}
          </span>
        </div>
      ) : (
        <p className="crm-muted crm-ptarjeta__contacto">Sin contacto registrado.</p>
      )}
      <p className="crm-ptarjeta__ultima">
        {ultima ? (
          <>
            Último: {t.icono} {t.label} · {formatDate(ultima.fecha, 'd MMM')}
            {ultima.nota ? <span className="crm-muted"> — {ultima.nota}</span> : null}
          </>
        ) : (
          <span className="crm-muted">Nunca se ha registrado un contacto.</span>
        )}
      </p>
      <div className="crm-ptarjeta__pie">
        {mostrarQuien && <span className="crm-muted">{quien ? usuarios.nombre(quien) : 'Sin asignar'}</span>}
        <button type="button" className="btn btn--primary btn--small" onClick={onRegistrar}>
          Registrar contacto
        </button>
      </div>
    </article>
  )
}
