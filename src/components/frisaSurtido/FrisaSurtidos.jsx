import { useMemo, useState } from 'react'
import { ESTADOS_SURTIDO, lineasPorSurtido, ordenarPendientes, piezasDe, textoLimite, clavePlanta, plantasDe, juntarPorClave } from '../../utils/frisaSurtido'
import { fechaCorta, NombreFrisa } from '../frisaNiveles/comunes'
import { EstadoSurtido } from './comunes'
import FrisaSurtidoDetalle from './FrisaSurtidoDetalle'
import FrisaSurtidoForm from './FrisaSurtidoForm'
import FrisaEntregasVarias from './FrisaEntregasVarias'

const num = (n) => Number(n || 0).toLocaleString('es-MX')


const FILTROS = ['pendiente', 'surtida', 'entregada', 'cancelada']

// Lista de órdenes de surtido por estado + subir OC + detalle.
export default function FrisaSurtidos({ datos, inv, urgente, permisos, recargar }) {
  const [filtro, setFiltro] = useState('pendiente')
  const [texto, setTexto] = useState('')
  const [planta, setPlanta] = useState('') // '' = todas
  const [abierta, setAbierta] = useState(null) // id
  const [nueva, setNueva] = useState(false)
  const [aviso, setAviso] = useState(null)

  const porSurtido = useMemo(() => lineasPorSurtido(datos.lineas), [datos])
  const completaPorId = useMemo(() => new Map(urgente.ordenes.map((o) => [o.surtido.id, o])), [urgente])
  const conteo = Object.fromEntries(FILTROS.map((f) => [f, datos.surtidos.filter((s) => s.estado === f).length]))

  const lista = useMemo(() => {
    const t = texto.trim().toLowerCase()
    let l = datos.surtidos.filter((s) => s.estado === filtro)
    if (planta) l = l.filter((s) => clavePlanta(s.planta) === planta)
    if (t) l = l.filter((s) => s.numero_oc.toLowerCase().includes(t) || s.planta.toLowerCase().includes(t) || (s.remision || '').toLowerCase().includes(t))
    if (filtro === 'pendiente' || filtro === 'surtida') return ordenarPendientes(l)
    return l // las demás: la más reciente primero (así vienen)
  }, [datos, filtro, texto, planta])
  const plantas = useMemo(() => plantasDe(datos.surtidos.filter((s) => s.estado === filtro)), [datos, filtro])
  const juntas = useMemo(() => (planta && filtro === 'pendiente' ? juntarPorClave(lista, porSurtido, inv) : null), [planta, filtro, lista, porSurtido, inv])

  // Lo que falta por clave para surtir todas las pendientes (antes en la pestaña Urgente).
  const faltan = urgente.porClave.filter((c) => c.falta > 0)
  const abiertaS = abierta ? datos.surtidos.find((s) => s.id === abierta) : null

  async function despuesDeGuardar(msg, id) {
    setAviso(msg)
    await recargar()
    if (id) setAbierta(id)
  }

  return (
    <div className="page frisa frisa-surtido">
      <div className="frisa__encabezado">
        <div>
          <h1 className="page-title">Frisa · órdenes de surtido</h1>
          <p className="page-subtitle">
            Cada orden de compra de Frisa se surte completa: al marcarla surtida las piezas se apartan, y cuando el chofer ya la
            entregó se descuentan del inventario.
          </p>
        </div>
        {permisos.oc && (
          <div className="frisa__botones">
            <button type="button" className="btn btn--primary btn--small" onClick={() => setNueva(true)}>+ Subir orden de compra</button>
          </div>
        )}
      </div>

      {aviso && <p className="frisa__ok">{aviso}</p>}

      {filtro === 'pendiente' && urgente.ordenes.length > 0 && (() => {
        // Repartiendo el inventario disponible de la que vence primero a la última.
        const os = urgente.ordenes
        const si = os.filter((o) => o.completa)
        const compiten = os.filter((o) => !o.completa && o.alcanzaSola)
        const no = os.filter((o) => !o.completa && !o.alcanzaSola)
        const pz = (l) => num(l.reduce((t, o) => t + piezasDe(o.lineas), 0))
        return (
          <>
            <div className="stats-grid frisa-niveles__resumen">
              <div className="stat-card"><span className="stat-card__label">Pendientes</span><span className="stat-card__value">{os.length}</span><span className="stat-card__hint">{pz(os)} pzas</span></div>
              <div className="stat-card frisa-niveles__tarjeta--ok"><span className="stat-card__label">Sí se pueden surtir</span><span className="stat-card__value">{si.length}</span><span className="stat-card__hint">{pz(si)} pzas, todas juntas</span></div>
              {compiten.length > 0 && <div className="stat-card frisa-niveles__tarjeta--pedir"><span className="stat-card__label">Alcanzan solas</span><span className="stat-card__value">{compiten.length}</span><span className="stat-card__hint">{pz(compiten)} pzas · otra que vence antes ocupa las piezas</span></div>}
              <div className="stat-card frisa-niveles__tarjeta--critico"><span className="stat-card__label">No se pueden surtir</span><span className="stat-card__value">{compiten.length + no.length}</span><span className="stat-card__hint">faltan {num(urgente.piezasFaltantes)} pzas en total</span></div>
            </div>
            <p className="frisa__sub">El inventario se reparte de la orden que vence primero a la última: las {si.length} en verde se pueden surtir todas al mismo tiempo con lo que hay.</p>
            {!planta && faltan.length > 0 && (
              <section className="frisa-restock__seccion">
                <h2 className="section-title section-title--small">Lo que falta por clave (todas las órdenes pendientes)</h2>
                <div className="revision__tabla-wrap">
                  <table className="simple-table frisa-tabla frisa-niveles__tabla">
                    <thead><tr><th>Clave</th><th className="num">Piden</th><th className="num">Disponible</th><th className="num">Falta</th></tr></thead>
                    <tbody>
                      {faltan.map((c) => (
                        <tr key={c.producto.id} className="frisa-niveles__fila--critico">
                          <td data-label="Clave"><strong>{c.producto.clave}</strong><NombreFrisa producto={c.producto} /></td>
                          <td data-label="Piden" className="num">{num(c.pendiente)}</td>
                          <td data-label="Disponible" className="num">{num(c.disponible)}</td>
                          <td data-label="Falta" className="num"><strong className="frisa__falta">{num(c.falta)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )
      })()}

      <div className="frisa-niveles__filtros">
        <div className="order-filters__chips frisa__chips">
          {FILTROS.map((f) => (
            <button key={f} type="button" className={'chip' + (filtro === f ? ' chip--active' : '')} onClick={() => setFiltro(f)}>
              {ESTADOS_SURTIDO[f].label}s ({conteo[f]})
            </button>
          ))}
        </div>
        {plantas.length > 1 && (
          <div className="order-filters__chips frisa__chips" aria-label="Planta">
            <button type="button" className={'chip' + (!planta ? ' chip--active' : '')} onClick={() => setPlanta('')}>Todas las plantas</button>
            {plantas.map((pl) => (
              <button key={pl.clave} type="button" className={'chip' + (planta === pl.clave ? ' chip--active' : '')} onClick={() => setPlanta(pl.clave)}>
                {pl.nombre} ({pl.ordenes})
              </button>
            ))}
          </div>
        )}
        <div className="frisa-niveles__campos">
          <input className="input" type="search" placeholder="Buscar OC, planta o remisión" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
      </div>

      {juntas && juntas.length > 0 && (
        <div className="card frisa-restock__propuesta">
          <h3 className="section-title section-title--small">
            Para surtir juntas: {lista.length} órdenes de {plantas.find((x) => x.clave === planta)?.nombre} · {num(juntas.reduce((t, x) => t + x.cantidad, 0))} pzas
          </h3>
          <p className="frisa__sub">Lo que piden todas sus órdenes pendientes, sumado por clave. Embolsa todo y luego marca cada orden.</p>
          <div className="revision__tabla-wrap">
            <table className="simple-table frisa-tabla frisa-niveles__tabla">
              <thead><tr><th>Clave</th><th className="num">Órdenes</th><th className="num">Piden</th><th className="num">Hay</th></tr></thead>
              <tbody>
                {juntas.map((x) => (
                  <tr key={x.producto.id} className={x.falta ? 'frisa-niveles__fila--critico' : 'frisa-niveles__fila--ok'}>
                    <td data-label="Clave"><strong>{x.producto.clave}</strong><NombreFrisa producto={x.producto} /></td>
                    <td data-label="Órdenes" className="num">{x.ordenes}</td>
                    <td data-label="Piden" className="num"><strong>{num(x.cantidad)}</strong></td>
                    <td data-label="Hay" className="num">{x.falta ? <span className="frisa__falta">{num(x.disponible)} · faltan {num(x.falta)}</span> : <span className="frisa__ok">{num(x.disponible)} ✓</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!lista.length && <div className="card frisa__vacio"><p>No hay órdenes {ESTADOS_SURTIDO[filtro].label.toLowerCase()}s.</p></div>}

      {filtro === 'surtida' && permisos.entregar && lista.length > 0 && (
        <FrisaEntregasVarias key={lista.map((x) => x.id).join(',')} ordenes={lista} porSurtido={porSurtido} onListo={(msg) => despuesDeGuardar(msg)} />
      )}

      <div className="frisa-oc-lista">
        {lista.map((s) => {
          const ls = porSurtido.get(s.id) || []
          const lim = textoLimite(s.fecha_limite)
          const u = completaPorId.get(s.id)
          return (
            <button key={s.id} type="button" className="card frisa-surtido__tarjeta" onClick={() => setAbierta(s.id)}>
              <span className="frisa-surtido__fila1">
                <span className="frisa-oc__num">OC {s.numero_oc}</span>
                <EstadoSurtido estado={s.estado} />
                {s.estado === 'pendiente' && u && (
                  u.completa
                    ? <span className="frisa-nivel frisa-nivel--verde">Se puede surtir</span>
                    : u.alcanzaSola
                      ? <span className="frisa-nivel frisa-nivel--naranja">Alcanza, pero la ocupa {u.compiteCon.length ? `OC ${u.compiteCon.join(', OC ')}` : 'otra OC'}</span>
                      : <span className="frisa-nivel frisa-nivel--rojo">Falta inventario</span>
                )}
              </span>
              <span className="frisa-oc__planta">{s.planta}</span>
              <span className="frisa__sub">
                {ls.length} clave{ls.length === 1 ? '' : 's'} · {num(piezasDe(ls))} pzas
                {s.estado === 'pendiente' || s.estado === 'surtida'
                  ? <> · <span className={lim.urgente ? 'frisa__falta' : ''}>{lim.texto}</span></>
                  : s.fecha_limite ? ` · Límite ${fechaCorta(s.fecha_limite)}` : ''}
              </span>
              {s.estado === 'pendiente' && u && !u.completa && u.faltantes.length > 0 && (
                <span className="frisa__falta">Falta: {u.faltantes.map((f) => `${f.clave} (${num(f.falta)})`).join(', ')}</span>
              )}
              {s.estado === 'surtida' && <span className="frisa__sub">Surtió {s.surtido_por_nombre}</span>}
              {s.estado === 'entregada' && <span className="frisa__sub">Rem. {s.remision} · {fechaCorta(s.fecha_entrega)} · surtió {s.surtido_por_nombre}</span>}
              {s.estado === 'cancelada' && <span className="frisa__sub">{s.cancelado_motivo}</span>}
            </button>
          )
        })}
      </div>

      {abiertaS && (
        <FrisaSurtidoDetalle surtido={abiertaS} lineas={porSurtido.get(abiertaS.id) || []} inv={inv} permisos={permisos} urgente={completaPorId.get(abiertaS.id)}
          productos={datos.productos} alias={datos.alias}
          onClose={() => setAbierta(null)} onCambio={(msg) => despuesDeGuardar(msg, abiertaS.id)} />
      )}
      {nueva && (
        <FrisaSurtidoForm productos={datos.productos} alias={datos.alias} existentes={datos.surtidos} onClose={() => setNueva(false)}
          onGuardada={(s) => { setNueva(false); setFiltro('pendiente'); despuesDeGuardar(`Se creó la orden de surtido de la OC ${s.numero_oc}.`, s.id) }} />
      )}
    </div>
  )
}
