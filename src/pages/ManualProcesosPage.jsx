import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/common/States'
import AyudaModulo from '../components/common/AyudaModulo'
import { MANUALES_PROCESOS, SECCIONES_PROCESOS, MANUALES_PAGINA, MANUALES_PAGINA_POR_SECCION, manualProceso } from '../data/manualesProcesos'
import { fetchClavesManuales } from '../services/manualesService'

// Manual de Procesos — cómo se hace cada proceso, igual para todos.
// Aparte del módulo "Manuales" (V196, en la base): este es solo lectura y su
// contenido vive en src/data/manualesProcesos.js. Todos los roles lo ven.
//   /procesos      lista (pestañas por sección + buscador)
//   /procesos/:id  un manual

const CLASE_SISTEMA = {
  Microsip: 'proc-chip--microsip',
  'Página': 'proc-chip--pagina',
  'Papelito Salper': 'proc-chip--papelito',
  Calendario: 'proc-chip--calendario',
}

// Sin acentos ni mayúsculas, para que "credito" encuentre "crédito".
function normalizar(t) {
  return (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// "Nunca" y "Si" ya van antes del texto: "Subas…" → "Nunca subas…".
function minusculaInicial(t) {
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t
}

// El título de la caja ya dice "…cuando…": "cuando se pone la primera pieza." →
// "Se pone la primera pieza."
function sinCuando(t) {
  const s = (t || '').replace(/^cuando\s+/i, '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Ligas a manuales del módulo Manuales (en la base) por su clave. Si todavía no
// carga la lista de claves (o no existe esa clave), la liga va a /manuales.
function useClavesManuales(activo) {
  const [claves, setClaves] = useState(null)
  useEffect(() => {
    if (!activo) return undefined
    let vivo = true
    fetchClavesManuales().then((m) => { if (vivo) setClaves(m) }).catch(() => {})
    return () => { vivo = false }
  }, [activo])
  return (clave) => {
    const id = claves?.get(String(clave).toLowerCase())
    return id ? `/manuales/ver/${id}` : '/manuales'
  }
}

function LigasManuales({ claves, titulo }) {
  const ruta = useClavesManuales(claves.length > 0)
  if (!claves.length) return null
  return (
    <div className="proc-relacionados proc-manuales-pagina">
      <h2 className="proc-subtitulo">{titulo}</h2>
      <ul>
        {claves.map((c) => (
          <li key={c}><Link to={ruta(c)}>📘 {MANUALES_PAGINA[c] || c}</Link></li>
        ))}
      </ul>
    </div>
  )
}

function Chips({ sistemas }) {
  return (
    <div className="proc-chips">
      {sistemas.map((s) => (
        <span key={s} className={'proc-chip ' + (CLASE_SISTEMA[s] || '')}>{s}</span>
      ))}
    </div>
  )
}

export default function ManualProcesosPage() {
  const { id } = useParams()
  return id ? <VerManual id={id} /> : <Lista />
}

function Lista() {
  const [seccion, setSeccion] = useState(() => {
    try { return sessionStorage.getItem('procesos.seccion') || 'Tienda' } catch { return 'Tienda' }
  })
  const [texto, setTexto] = useState('')

  useEffect(() => {
    try { sessionStorage.setItem('procesos.seccion', seccion) } catch { /* sin almacenamiento */ }
  }, [seccion])

  const q = normalizar(texto)
  const lista = useMemo(
    () => MANUALES_PROCESOS.filter((m) => (q ? normalizar(m.titulo).includes(q) : m.seccion === seccion)),
    [q, seccion],
  )

  return (
    <div className="page page--narrow procesos">
      <div className="section-header">
        <h2 className="section-title">📖 Manual de Procesos <AyudaModulo id="procesos" /></h2>
      </div>
      <p className="procesos-intro">Así se hace cada proceso. Todos lo hacemos igual.</p>

      <input
        type="search"
        className="input procesos-buscador"
        placeholder="Buscar por nombre…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        aria-label="Buscar manual por nombre"
      />

      {!q && (
        <div className="procesos-pestanas" role="tablist">
          {SECCIONES_PROCESOS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === seccion}
              className={'procesos-pestana' + (s === seccion ? ' procesos-pestana--activa' : '')}
              onClick={() => setSeccion(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {q && <div className="procesos-cuenta">{lista.length === 1 ? '1 manual' : `${lista.length} manuales`}</div>}

      {lista.length === 0 ? (
        q ? <EmptyState>No hay ningún manual con ese nombre.</EmptyState> : <EmptyState>Próximamente.</EmptyState>
      ) : (
        <div className="procesos-tarjetas">
          {lista.map((m) => (
            <Link key={m.id} to={`/procesos/${m.id}`} className="procesos-tarjeta">
              {q && <span className="procesos-tarjeta__seccion">{m.seccion}</span>}
              <span className="procesos-tarjeta__titulo">{m.titulo}</span>
              <span className="procesos-tarjeta__resumen">{m.resumen}</span>
              <Chips sistemas={m.dondeSeHace} />
            </Link>
          ))}
        </div>
      )}

      {!q && (
        <LigasManuales
          claves={MANUALES_PAGINA_POR_SECCION[seccion] || []}
          titulo={`También en Manuales (${seccion})`}
        />
      )}
    </div>
  )
}

function VerManual({ id }) {
  const m = manualProceso(id)

  useEffect(() => { window.scrollTo(0, 0) }, [id])

  if (!m) {
    return (
      <div className="page page--narrow procesos">
        <Link to="/procesos" className="procesos-regresar">← Manual de Procesos</Link>
        <EmptyState>Ese manual no existe.</EmptyState>
      </div>
    )
  }

  // Imprimir: solo la hoja del manual (ver @media print en index.css).
  function imprimir() {
    document.body.classList.add('imprime-proceso')
    const quitar = () => {
      document.body.classList.remove('imprime-proceso')
      window.removeEventListener('afterprint', quitar)
    }
    window.addEventListener('afterprint', quitar)
    window.print()
  }

  const reportar = m.reportar?.length > 0 && (
          <div className="proc-reportar">
            <div className="proc-reportar__titulo">{m.reportarTitulo || 'Al terminar, reporta:'}</div>
            <ul>
              {m.reportar.map((r) => {
                const texto = typeof r === 'string' ? r : r.texto
                return (
                  <li key={texto}>
                    <span className="proc-reportar__caja" aria-hidden="true">☐</span>
                    <span>
                      {texto}
                      {r.porConfirmar && <span className="proc-reportar__confirmar"> (por confirmar)</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
  )

  const relacionados = (m.relacionados || []).map(manualProceso).filter(Boolean)

  return (
    <div className="page page--narrow procesos">
      <Link to="/procesos" className="procesos-regresar">← Manual de Procesos</Link>

      <article className="proc-hoja">
        <div className="proc-hoja__seccion">{m.seccion}</div>
        <h1 className="proc-hoja__titulo">{m.titulo}</h1>

        <div className="proc-hoja__acciones">
          {m.moduloLink && <Link to={m.moduloLink} className="btn btn--primary">Ir al módulo →</Link>}
          <button type="button" className="btn btn--secondary" onClick={imprimir}>🖨 Imprimir</button>
        </div>

        {m.inicioYFin && (
          <div className="proc-iyf">
            {m.inicioYFin.etapa && <div className="proc-iyf__etapa">{m.inicioYFin.etapa}</div>}
            <div className="proc-iyf__cajas">
              <div className="proc-iyf__caja proc-iyf__caja--inicio">
                <div className="proc-iyf__titulo">▶ Se da Inicio cuando…</div>
                <p>{sinCuando(m.inicioYFin.inicio)}</p>
                {m.inicioYFin.botonInicio && <div className="proc-iyf__boton">Botón: <strong>{m.inicioYFin.botonInicio}</strong></div>}
              </div>
              <div className="proc-iyf__caja proc-iyf__caja--fin">
                <div className="proc-iyf__titulo">■ Se da Terminado cuando…</div>
                <p>{sinCuando(m.inicioYFin.fin)}</p>
                {m.inicioYFin.botonFin && <div className="proc-iyf__boton">Botón: <strong>{m.inicioYFin.botonFin}</strong></div>}
              </div>
            </div>
          </div>
        )}

        {m.cuandoAplica && (
          <div className="proc-bloque">
            <div className="proc-bloque__etiqueta">Cuándo aplica</div>
            <p className="proc-bloque__texto">{m.cuandoAplica}</p>
          </div>
        )}

        <div className="proc-bloque">
          <div className="proc-bloque__etiqueta">Dónde se hace</div>
          <Chips sistemas={m.dondeSeHace} />
        </div>

        {(m.bloques || []).map((b, i) => (
          <div key={i} className="proc-info">
            {b.titulo && <h2 className="proc-subtitulo">{b.titulo}</h2>}
            {(b.parrafos || []).map((t) => <p key={t} className="proc-info__p">{t}</p>)}
            {b.items?.length > 0 && <ul className="proc-info__lista">{b.items.map((t) => <li key={t}>{t}</li>)}</ul>}
            {b.tabla && (
              <div className="proc-tabla-wrap">
                <table className="proc-tabla">
                  <thead><tr>{b.tabla.columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {b.tabla.filas.map((f) => (
                      <tr key={f[0]}>{f.map((c, j) => <td key={j} data-col={b.tabla.columnas[j]}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}

        {m.reportarAntes && reportar}


        <h2 className="proc-subtitulo">Pasos</h2>
        <ol className="proc-pasos">
          {m.pasos.map((p, i) => {
            const texto = typeof p === 'string' ? p : p.texto
            const sub = typeof p === 'string' ? null : p.sub
            return (
              <li key={i} className="proc-paso">
                <span className="proc-paso__num" aria-hidden="true">{i + 1}</span>
                <div className="proc-paso__cuerpo">
                  <span>{texto}</span>
                  {sub && (
                    <ul className="proc-paso__sub">
                      {sub.map((s) => <li key={s}>{s}</li>)}
                    </ul>
                  )}
                </div>
              </li>
            )
          })}
        </ol>

        {!m.reportarAntes && reportar}

        {m.nunca?.length > 0 && (
          <div className="proc-nunca">
            <div className="proc-nunca__titulo">⛔ Nunca</div>
            <ul>
              {m.nunca.map((n) => <li key={n}>Nunca {minusculaInicial(n)}</li>)}
            </ul>
          </div>
        )}

        {m.bifurcaciones?.length > 0 && (
          <>
            <h2 className="proc-subtitulo">Si pasa esto → haz esto</h2>
            <div className="proc-bifs">
              {m.bifurcaciones.map((b, i) => {
                const destino = b.manual ? manualProceso(b.manual) : null
                return (
                  <div key={i} className="proc-bif">
                    <div className="proc-bif__si"><strong>Si</strong> {b.si}</div>
                    <div className="proc-bif__entonces">
                      <span aria-hidden="true">→ </span>
                      {b.entonces}
                      {destino && (
                        <>{b.entonces ? ' ' : ''}Ver manual <Link to={`/procesos/${destino.id}`}>"{destino.titulo}"</Link>.</>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {relacionados.length > 0 && (
          <div className="proc-relacionados">
            <h2 className="proc-subtitulo">Manuales relacionados</h2>
            <ul>
              {relacionados.map((r) => (
                <li key={r.id}><Link to={`/procesos/${r.id}`}>{r.titulo}</Link></li>
              ))}
            </ul>
          </div>
        )}

        <LigasManuales claves={m.manualesPagina || []} titulo="En Manuales" />

        {m.manualExterno && (
          <p className="proc-externo">
            Ver también: <strong>{m.manualExterno}</strong> (manual físico, no está en la página).
          </p>
        )}
      </article>

      <Link to="/procesos" className="btn btn--secondary procesos-regresar-abajo">← Regresar a la lista</Link>
    </div>
  )
}
