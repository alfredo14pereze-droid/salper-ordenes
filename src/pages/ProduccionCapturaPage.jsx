import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canCapturarProduccion, canViewProduccionMontos } from '../utils/permissions'
import {
  fetchOperadorasActivas,
  fetchOperaciones,
  fetchSemanaPorInicio,
  capturarRegistro,
  editarRegistro,
  borrarRegistro,
  listarRegistros,
  resumenCaptura,
} from '../services/produccionService'

// V68 — Captura rápida de producción (Juanis). Prioridad: más rápida que el
// Excel y 100% con teclado. Flujo: fecha → operadora (número o nombre, Enter)
// → Folio [Tab] Piezas [Enter = guarda y vuelve al folio]. F2 = cambiar de
// operadora sin soltar el teclado. NUNCA muestra pesos (solo piezas).
export default function ProduccionCapturaPage() {
  return (
    <RequireRole allow={canCapturarProduccion}>
      <Captura />
    </RequireRole>
  )
}

const pad = (n) => String(n).padStart(2, '0')
const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromStr = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const fmt = (s) => fromStr(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Semana de producción: miércoles a martes.
function semanaDe(fechaStr) {
  const d = fromStr(fechaStr)
  const atras = (d.getDay() - 3 + 7) % 7
  const ini = new Date(d.getFullYear(), d.getMonth(), d.getDate() - atras)
  const fin = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 6)
  return { ini: toStr(ini), fin: toStr(fin) }
}

const ESTADO_LABEL = { abierta: 'abierta', en_revision: 'en revisión', aprobada: 'aprobada' }

function Captura() {
  const { role } = useAuth()
  const esAdmin = canViewProduccionMontos(role)
  const hoy = toStr(new Date())
  const [operadoras, setOperadoras] = useState([])
  const [operaciones, setOperaciones] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [fecha, setFecha] = useState(hoy)
  const [operadora, setOperadora] = useState(null)
  const [query, setQuery] = useState('')
  const [idx, setIdx] = useState(0)
  const [folio, setFolio] = useState('')
  const [piezas, setPiezas] = useState('')
  const [warn, setWarn] = useState(null)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)
  const [saving, setSaving] = useState(false)
  const [registros, setRegistros] = useState([])
  const [resumen, setResumen] = useState(null)
  const [semana, setSemana] = useState(null)
  const [verFaltan, setVerFaltan] = useState(false)
  const [edit, setEdit] = useState(null)

  const opRef = useRef(null)
  const folioRef = useRef(null)
  const piezasRef = useRef(null)

  useEffect(() => {
    Promise.all([fetchOperadorasActivas(), fetchOperaciones()]).then(([o, p]) => {
      const err = o.error || p.error
      if (err) setLoadError(err)
      else {
        setOperadoras(o.data || [])
        setOperaciones(new Map((p.data || []).map((x) => [x.folio, x])))
      }
      setLoading(false)
    })
  }, [])

  const sem = useMemo(() => semanaDe(fecha), [fecha])
  // Misma regla que el servidor (prod_puede_editar_semana): aprobada = nunca; admins mientras no esté
  // aprobada; quien solo captura: solo si está abierta Y su martes no ha terminado.
  const estadoBase = semana?.estado || 'abierta'
  const vencida = estadoBase === 'abierta' && sem.fin < hoy
  const estadoSemana = vencida ? 'en_revision' : estadoBase
  const puedeCapturar = estadoBase === 'aprobada' ? false : esAdmin ? true : estadoBase === 'abierta' && !vencida

  const refrescar = useCallback(async () => {
    const [r, s, sm] = await Promise.all([
      operadora ? listarRegistros(fecha, operadora.id) : Promise.resolve({ data: [] }),
      resumenCaptura(fecha),
      fetchSemanaPorInicio(sem.ini),
    ])
    if (!r.error) setRegistros(r.data || [])
    if (!s.error) setResumen(s.data)
    if (!sm.error) setSemana(sm.data)
  }, [fecha, operadora, sem.ini])

  useEffect(() => {
    if (!loading) refrescar()
  }, [loading, refrescar])

  // F2 = siguiente operadora, sin soltar el teclado.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'F2') {
        e.preventDefault()
        cambiarOperadora()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // El foco sigue al flujo: con operadora elegida -> Folio; sin ella -> buscador.
  useEffect(() => {
    if (loading) return
    if (operadora) folioRef.current?.focus()
    else opRef.current?.focus()
  }, [operadora, loading])

  function cambiarOperadora() {
    setOperadora(null)
    setQuery('')
    setIdx(0)
    setFolio('')
    setPiezas('')
    setWarn(null)
    setError(null)
    setFlash(null)
    setRegistros([])
  }

  function elegir(o) {
    setOperadora(o)
    setQuery('')
    setError(null)
  }

  const sugeridas = useMemo(() => {
    const q = norm(query).trim()
    if (!q) return operadoras.slice(0, 8)
    if (/^\d+$/.test(q)) {
      const exacta = operadoras.filter((o) => String(o.numero_operadora) === q)
      const resto = operadoras.filter((o) => String(o.numero_operadora).startsWith(q) && String(o.numero_operadora) !== q)
      return [...exacta, ...resto].slice(0, 8)
    }
    return operadoras.filter((o) => norm(o.nombre).includes(q)).slice(0, 8)
  }, [operadoras, query])

  function onOpKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx((i) => Math.min(i + 1, sugeridas.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const o = sugeridas[idx] || sugeridas[0]
      if (o) elegir(o)
    }
  }

  const opActual = folio ? operaciones.get(Number(folio)) : null

  async function guardar() {
    if (saving) return
    setError(null)
    const f = Number(folio)
    const p = Number(piezas)
    if (!operadora) return setError('Elige primero la operadora.')
    if (!operaciones.has(f)) {
      setError(`El folio ${folio || '(vacío)'} no existe.`)
      return folioRef.current?.focus()
    }
    if (!Number.isInteger(p) || p <= 0) return setError('Las piezas deben ser un número mayor a cero.')
    const confirmado = !!warn && warn.folio === f && warn.piezas === p
    setSaving(true)
    const { data, error: err } = await capturarRegistro({ fecha, operadoraId: operadora.id, folio: f, piezas: p, confirmado })
    setSaving(false)
    if (err) return setError(err.message)
    if (data?.requiere_confirmacion) {
      setWarn({ folio: f, piezas: p, adv: data.advertencias })
      return
    }
    setWarn(null)
    setFolio('')
    setPiezas('')
    setFlash(`✓ Folio ${f} · ${p} pieza${p === 1 ? '' : 's'} (${data.operacion})`)
    refrescar()
    folioRef.current?.focus()
  }

  function onFolioKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      piezasRef.current?.focus()
    } else if (e.key === 'Escape') {
      setFolio('')
      setWarn(null)
    }
  }

  function onPiezasKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      guardar()
    } else if (e.key === 'Escape') {
      if (warn) setWarn(null)
      else {
        setPiezas('')
        folioRef.current?.focus()
      }
    }
  }

  async function guardarEdicion() {
    const f = Number(edit.folio)
    const p = Number(edit.piezas)
    let { data, error: err } = await editarRegistro({ id: edit.id, folio: f, piezas: p })
    if (!err && data?.requiere_confirmacion) {
      if (!window.confirm(`${data.advertencias.join('\n')}\n\n¿Guardar de todos modos?`)) return
      ;({ data, error: err } = await editarRegistro({ id: edit.id, folio: f, piezas: p, confirmado: true }))
    }
    if (err) return setError(err.message)
    setEdit(null)
    refrescar()
  }

  async function borrar(r) {
    if (!window.confirm(`¿Borrar folio ${r.folio} · ${r.piezas} piezas?`)) return
    const { error: err } = await borrarRegistro(r.id)
    if (err) return setError(err.message)
    refrescar()
  }

  if (loading) return <Loading label="Cargando catálogos…" />
  if (loadError) return <ErrorState error={loadError} />

  const etiquetaDia = fecha === hoy ? 'hoy' : `el ${fmt(fecha)}`

  return (
    <div className="page page--narrow captura">
      <h2 className="section-title">Captura de producción</h2>

      <div className="captura__top">
        <label>
          Fecha
          <input type="date" className="input" value={fecha} max={hoy} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        </label>
        <div className="captura__op">
          <span className="field-label">Operadora</span>
          {operadora ? (
            <div className="captura__chip">
              <b>{operadora.numero_operadora ?? '—'}</b> · {operadora.nombre}
              <button type="button" className="btn btn--ghost btn--small" onClick={cambiarOperadora}>
                Cambiar (F2)
              </button>
            </div>
          ) : (
            <>
              <input
                ref={opRef}
                type="text"
                className="input"
                placeholder="Número o nombre, Enter para elegir"
                value={query}
                autoFocus
                onChange={(e) => {
                  setQuery(e.target.value)
                  setIdx(0)
                }}
                onKeyDown={onOpKey}
              />
              <ul className="captura__sugerencias">
                {sugeridas.map((o, i) => (
                  <li key={o.id} className={i === idx ? 'captura__sug--activa' : ''} onMouseDown={() => elegir(o)}>
                    <b>{o.numero_operadora ?? '—'}</b> {o.nombre}
                  </li>
                ))}
                {sugeridas.length === 0 && <li className="captura__sug--vacia">Sin coincidencias</li>}
              </ul>
            </>
          )}
        </div>
      </div>

      <p className="captura__semana">
        Semana del {fmt(sem.ini)} al {fmt(sem.fin)} · <b>{ESTADO_LABEL[estadoSemana] || estadoSemana}</b>
        {!puedeCapturar && ' — ya no se puede capturar en esta semana.'}
      </p>

      {operadora && (
        <div className="captura__entrada">
          <label>
            Folio
            <input
              ref={folioRef}
              type="text"
              inputMode="numeric"
              className="input"
              value={folio}
              disabled={!puedeCapturar}
              onChange={(e) => {
                setFolio(e.target.value.replace(/\D/g, ''))
                setWarn(null)
              }}
              onKeyDown={onFolioKey}
            />
          </label>
          <label>
            Piezas
            <input
              ref={piezasRef}
              type="text"
              inputMode="numeric"
              className="input"
              value={piezas}
              disabled={!puedeCapturar}
              onChange={(e) => {
                setPiezas(e.target.value.replace(/\D/g, ''))
                setWarn(null)
              }}
              onKeyDown={onPiezasKey}
            />
          </label>
          <button type="button" className="btn btn--primary" onClick={guardar} disabled={saving || !puedeCapturar}>
            Guardar (Enter)
          </button>
        </div>
      )}

      {operadora && folio && (
        <p className={'captura__desc' + (opActual ? '' : ' captura__desc--error')}>
          {opActual ? (
            <>
              {opActual.prenda} · {opActual.parte} · {opActual.operacion}
              {!opActual.activa && <b> (inactivo)</b>}
            </>
          ) : (
            `El folio ${folio} no existe`
          )}
        </p>
      )}

      {warn && (
        <div className="captura__aviso" role="alert">
          {warn.adv.map((a) => (
            <div key={a}>⚠ {a}</div>
          ))}
          <div>
            <b>Enter</b> otra vez para confirmar · <b>Esc</b> para corregir
          </div>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      {flash && !error && !warn && <p className="captura__flash">{flash}</p>}

      {operadora && (
        <div className="captura__lista">
          <h3>
            Capturado {etiquetaDia} — {operadora.nombre} ({registros.reduce((s, r) => s + r.piezas, 0)} piezas)
          </h3>
          {registros.length === 0 ? (
            <p className="template-hint">Nada capturado todavía.</p>
          ) : (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Operación</th>
                  <th>Piezas</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {registros.map((r) =>
                  edit?.id === r.id ? (
                    <tr key={r.id}>
                      <td>
                        <input className="input input--small" value={edit.folio} onChange={(e) => setEdit({ ...edit, folio: e.target.value.replace(/\D/g, '') })} />
                      </td>
                      <td>{operaciones.get(Number(edit.folio))?.operacion || '—'}</td>
                      <td>
                        <input className="input input--small" value={edit.piezas} onChange={(e) => setEdit({ ...edit, piezas: e.target.value.replace(/\D/g, '') })} />
                      </td>
                      <td>
                        <button type="button" className="btn btn--primary btn--small" onClick={guardarEdicion}>
                          Guardar
                        </button>{' '}
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => setEdit(null)}>
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id}>
                      <td>{r.folio}</td>
                      <td>
                        {r.prenda} · {r.parte} · {r.operacion}
                      </td>
                      <td>{r.piezas}</td>
                      <td>
                        {(r.semana_estado !== 'aprobada' && (esAdmin || (r.semana_estado === 'abierta' && !vencida))) && (
                          <>
                            <button type="button" className="btn btn--ghost btn--small" onClick={() => setEdit({ id: r.id, folio: String(r.folio), piezas: String(r.piezas) })}>
                              Editar
                            </button>{' '}
                            <button type="button" className="btn btn--ghost btn--small" onClick={() => borrar(r)}>
                              Borrar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {resumen && (
        <div className="captura__resumen">
          <b>
            {resumen.capturadas} de {resumen.total}
          </b>{' '}
          operadoras capturadas {etiquetaDia}
          {resumen.pendientes.length > 0 && (
            <>
              {' '}
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setVerFaltan((v) => !v)}>
                {verFaltan ? 'Ocultar' : `Ver a quién le falta (${resumen.pendientes.length})`}
              </button>
            </>
          )}
          {verFaltan && (
            <ul className="captura__faltan">
              {resumen.pendientes.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => elegir({ id: o.id, numero_operadora: o.numero, nombre: o.nombre })}
                  >
                    {o.numero ?? '—'} · {o.nombre}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="template-hint" style={{ marginTop: 16 }}>
        Teclado: Folio → Enter → Piezas → Enter guarda · F2 cambia de operadora.
      </p>
    </div>
  )
}
