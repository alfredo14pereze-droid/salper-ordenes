import { MESES } from '../../utils/crm'
import { montoCorto, pctTexto } from '../../utils/crmStats'
import { formatDate } from '../../utils/dates'

export function nombreMes(ym) {
  const [y, m] = ym.split('-')
  return `${MESES[Number(m) - 1]} ${y}`
}

function Barra({ valor }) {
  const v = valor === null || valor === undefined ? 0 : Math.max(0, Math.min(1, valor))
  return (
    <div className="crm-kpi__barra">
      <span style={{ width: `${Math.round(v * 100)}%` }} />
    </div>
  )
}

// Cifras grandes de arriba (como en el tablero de referencia).
export function CrmKpis({ st }) {
  const maxMonto = Math.max(st.enProceso, st.ganadoMonto, 1)
  return (
    <div className="crm-kpis-grupo">
      {/* Fila 1: dinero y pendientes */}
      <div className="crm-kpis crm-kpis--3">
        <div className="crm-kpi">
          <span className="crm-kpi__label">En proceso</span>
          <strong className="crm-kpi__valor">{montoCorto(st.enProceso)}</strong>
          <Barra valor={st.enProceso / maxMonto} />
          <span className="crm-kpi__pie">{st.abiertos} prospectos abiertos · monto cotizado</span>
        </div>
        <div className="crm-kpi">
          <span className="crm-kpi__label">Ganado</span>
          <strong className="crm-kpi__valor">{montoCorto(st.ganadoMonto)}</strong>
          <Barra valor={st.ganadoMonto / maxMonto} />
          <span className="crm-kpi__pie">
            {st.ganados} ganado{st.ganados === 1 ? '' : 's'} · monto vendido
          </span>
        </div>
        <div className={'crm-kpi' + (st.sinSeguimiento > 0 ? ' crm-kpi--alerta' : '')}>
          <span className="crm-kpi__label">Sin seguimiento</span>
          <strong className="crm-kpi__valor">{st.sinSeguimiento}</strong>
          <Barra valor={st.abiertos ? st.sinSeguimiento / st.abiertos : 0} />
          <span className="crm-kpi__pie">
            abiertos sin fecha para volver a contactar{st.vencidos ? ` · ${st.vencidos} vencido${st.vencidos === 1 ? '' : 's'}` : ''}
          </span>
        </div>
      </div>
      {/* Fila 2: tasas */}
      <div className="crm-kpis crm-kpis--4">
        <div className="crm-kpi crm-kpi--tasa">
          <span className="crm-kpi__label">Tasa de cierre</span>
          <strong className="crm-kpi__valor">{pctTexto(st.tasaCierre)}</strong>
          <Barra valor={st.tasaCierre} />
          <span className="crm-kpi__pie">
            {st.ganados} ganados de {st.ganados + st.perdidos} cerrados (ganados + perdidos)
          </span>
        </div>
        <div className="crm-kpi crm-kpi--tasa">
          <span className="crm-kpi__label">Ganados de cotizados</span>
          <strong className="crm-kpi__valor">{pctTexto(st.tasaGanadosCotizados)}</strong>
          <Barra valor={st.tasaGanadosCotizados} />
          <span className="crm-kpi__pie" title="Cuenta como cotizado si está en Cotizado o Ganado, o si tiene monto cotizado capturado (aunque después se haya perdido).">
            {st.ganados} ganados de {st.cotizados} cotizados ⓘ
          </span>
        </div>
        <div className="crm-kpi crm-kpi--tasa">
          <span className="crm-kpi__label">Ganados de contactados</span>
          <strong className="crm-kpi__valor">{pctTexto(st.tasaGanadosContactados)}</strong>
          <Barra valor={st.tasaGanadosContactados} />
          <span className="crm-kpi__pie" title="Contactados = los que contestaron (En conversación, Visita / reunión, Cotizado o Ganado).">
            {st.ganados} ganados de {st.contestaron} que contestaron ⓘ
          </span>
        </div>
        <div className="crm-kpi crm-kpi--tasa">
          <span className="crm-kpi__label">Tasa de respuesta</span>
          <strong className="crm-kpi__valor">{pctTexto(st.tasaRespuesta)}</strong>
          <Barra valor={st.tasaRespuesta} />
          <span className="crm-kpi__pie" title="Cuenta como que contestó si ya está En conversación, Visita / reunión, Cotizado o Ganado.">
            {st.contestaron} de {st.total} contestaron ⓘ
          </span>
        </div>
      </div>
    </div>
  )
}

// Pestaña "Estadísticas": embudo, contactos por semana y por persona, motivos de pérdida.
export function CrmEstadisticas({ st, usuarios }) {
  const maxEmbudo = Math.max(...st.embudo.map((e) => e.n), 1)
  const maxSemana = Math.max(...st.semanas.map((s) => s.n), 1)
  const maxUsuario = Math.max(...st.porUsuario.map((u) => u.n), 1)
  return (
    <div className="crm-stats">
      <section className="card crm-card">
        <h3 className="crm-card__titulo">Embudo</h3>
        <p className="crm-muted crm-stats__nota">Cuántos prospectos hay en cada estatus.</p>
        <ul className="crm-barras">
          {st.embudo.map((e) => (
            <li key={e.key}>
              <span className="crm-barras__label">{e.label}</span>
              <span className="crm-barras__pista">
                <span className="crm-barras__relleno" style={{ width: `${(e.n / maxEmbudo) * 100}%`, background: e.dot }} />
              </span>
              <span className="crm-barras__n">
                {e.n}
                {e.monto > 0 && <span className="crm-muted"> · {montoCorto(e.monto)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card crm-card">
        <h3 className="crm-card__titulo">Contactos registrados por semana</h3>
        <p className="crm-muted crm-stats__nota">Llamadas, correos, visitas y notas de la bitácora ({st.actividades} en total).</p>
        {st.semanas.length === 0 ? (
          <p className="crm-muted">Sin contactos registrados.</p>
        ) : (
          <div className="crm-semanas">
            {st.semanas.map((s) => (
              <div key={s.lunes} className="crm-semanas__col" title={`Semana del ${formatDate(s.lunes)}: ${s.n}`}>
                <span className="crm-semanas__n">{s.n}</span>
                <span className="crm-semanas__barra" style={{ height: `${Math.max(4, (s.n / maxSemana) * 120)}px` }} />
                <span className="crm-semanas__label">{formatDate(s.lunes, 'd MMM')}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card crm-card">
        <h3 className="crm-card__titulo">Contactos por persona</h3>
        {st.porUsuario.length === 0 ? (
          <p className="crm-muted">Sin contactos registrados.</p>
        ) : (
          <ul className="crm-barras">
            {st.porUsuario.map((u) => (
              <li key={u.id || 'nadie'}>
                <span className="crm-barras__label">{u.id ? usuarios.nombre(u.id) : 'Sin registrar quién'}</span>
                <span className="crm-barras__pista">
                  <span className="crm-barras__relleno" style={{ width: `${(u.n / maxUsuario) * 100}%` }} />
                </span>
                <span className="crm-barras__n">{u.n}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card crm-card">
        <h3 className="crm-card__titulo">Por qué se pierden</h3>
        {st.motivos.length === 0 ? (
          <p className="crm-muted">Todavía no hay prospectos perdidos.</p>
        ) : (
          <ul className="crm-motivos">
            {st.motivos.map((m) => (
              <li key={m.motivo}>
                <span>{m.motivo}</span>
                <strong>{m.n}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
