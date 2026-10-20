import { useCallback, useEffect, useState } from 'react'
import { TINTAS, formatMl, reporteDeEtapa } from '../../utils/impresionReporte'
import { format } from 'date-fns'
import { fetchOrdenEtapas, updateOrdenEtapa, corregirTiemposEtapa, setOrdenEtapas } from '../../services/ordersService'
import { fetchProfiles } from '../../services/usersService'
import { useAuth } from '../../contexts/AuthContext'
import { canChangeEtapa, canEditEtapasOrden } from '../../utils/permissions'
import { etapasParaAgregar, etiquetaEtapaOrden, resumenEtapas, sePuedeQuitar, validarEtapasOrden } from '../../utils/etapasOrden'
import { moverProceso } from '../../utils/frisa'
import { ETAPA_LABELS, ETAPA_ESTADO_LABELS, ETAPA_ESTADO_COLORS } from '../../lib/constants'
import { formatDateTime, parseDate } from '../../utils/dates'
import { medirEtapa } from '../../utils/tiemposEtapas'
import { formatMinutosHabiles } from '../../utils/horasHabiles'
import EtapaCronometro from './EtapaCronometro'

// El siguiente estado en el ciclo pendiente -> en_proceso -> completado.
// Un rol de etapa solo avanza, nunca retrocede desde aquí (admin_fabrica/
// admin_general sí pueden, con el botón de "regresar" aparte).
const NEXT_ESTADO = { pendiente: 'en_proceso', en_proceso: 'completado', completado: null }

const paraInput = (valor) => (valor ? format(parseDate(valor), "yyyy-MM-dd'T'HH:mm") : '')

// V139 — corrección de las horas de una etapa terminada. Solo admin_general;
// el servidor exige el motivo y deja registro del antes y el después.
function CorregirTiempos({ orderId, etapa, onListo, onCancelar }) {
  const [inicio, setInicio] = useState(paraInput(etapa.iniciado_en))
  const [fin, setFin] = useState(paraInput(etapa.completado_en))
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const { error: err } = await corregirTiemposEtapa(orderId, etapa.etapa, new Date(inicio).toISOString(), new Date(fin).toISOString(), motivo)
    setGuardando(false)
    if (err) return setError(err)
    onListo()
  }

  return (
    <form className="etapa-corregir" onSubmit={handleSubmit}>
      <label>
        Inicio
        <input type="datetime-local" className="input" required value={inicio} onChange={(e) => setInicio(e.target.value)} />
      </label>
      <label>
        Fin
        <input type="datetime-local" className="input" required value={fin} onChange={(e) => setFin(e.target.value)} />
      </label>
      <label className="etapa-corregir__motivo">
        Motivo de la corrección
        <input type="text" className="input" required value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      <div className="etapa-corregir__acciones">
        <button type="submit" className="btn btn--primary btn--small" disabled={guardando || !inicio || !fin || !motivo.trim()}>
          {guardando ? 'Guardando…' : 'Guardar corrección'}
        </button>
        <button type="button" className="btn btn--secondary btn--small" disabled={guardando} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
      {error && <p className="form-error">{error.message}</p>}
    </form>
  )
}

// V157 — "Editar etapas" (admin_fabrica / admin_general): quitar las que no
// han empezado, agregar otras y cambiar el orden. Ver set_orden_etapas.
function EditarEtapas({ orderId, etapas, onListo, onCancelar }) {
  const [lista, setLista] = useState(etapas.map((e) => ({ etapa: e.etapa, estado: e.estado })))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const disponibles = etapasParaAgregar(lista)

  async function handleGuardar() {
    const falta = validarEtapasOrden(lista, etapas)
    if (falta) return setError(new Error(falta))
    if (!window.confirm(`¿Guardar las etapas de esta orden?\n\n${resumenEtapas(lista)}\n\nLas que quites dejan de aparecerle a su estación.`)) return
    setGuardando(true)
    setError(null)
    const { error: err } = await setOrdenEtapas(orderId, lista.map((f) => f.etapa))
    setGuardando(false)
    if (err) return setError(err)
    onListo()
  }

  return (
    <div className="editar-etapas">
      <div className="frisa-secuencia">
        {lista.map((f, i) => (
          <div key={f.etapa} className="frisa-secuencia__paso">
            <span className="frisa-secuencia__n">{i + 1}</span>
            <strong className="frisa-secuencia__nombre">{etiquetaEtapaOrden(f.etapa)}</strong>
            <span className="pantone-hint">{f.estado ? ETAPA_ESTADO_LABELS[f.estado] || f.estado : 'Nueva'}</span>
            <span className="frisa-secuencia__botones">
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setLista(moverProceso(lista, i, -1))} disabled={guardando || i === 0} aria-label="Subir">
                ↑
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setLista(moverProceso(lista, i, 1))} disabled={guardando || i === lista.length - 1} aria-label="Bajar">
                ↓
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setLista(lista.filter((_, j) => j !== i))}
                disabled={guardando || !sePuedeQuitar(f)}
                title={sePuedeQuitar(f) ? 'Quitar' : 'Ya se empezó: no se puede quitar'}
                aria-label="Quitar"
              >
                ×
              </button>
            </span>
          </div>
        ))}
        {disponibles.length > 0 && (
          <select className="input frisa-secuencia__agregar" value="" disabled={guardando} onChange={(e) => e.target.value && setLista([...lista, { etapa: e.target.value }])}>
            <option value="">+ Agregar etapa…</option>
            {disponibles.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="pantone-hint">Las etapas que ya empezaron no se pueden quitar (regrésalas a pendiente primero si fue un error). Las nuevas nacen pendientes.</p>
      {error && <p className="form-error">{error.message}</p>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn btn--primary btn--small" onClick={handleGuardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar etapas'}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// Etapas paralelas (V23, ver supabase/schema_v23_etapas_paralelas.sql):
// cada orden tiene una fila por etapa aplicable a su tipo — corte,
// sublimado, producción, bordado, terminado — cada una con su propio
// estado. Dos o más pueden estar "en_proceso" al mismo tiempo (ej.
// producción y terminado). Cada rol de etapa solo puede tocar SU fila
// (rol 'corte' -> etapa 'corte', etc.); admin_fabrica/admin_general
// pueden todas — ver canChangeEtapa en utils/permissions.js.
export default function OrderEtapasCard({ orderId, onUpdated }) {
  const { role } = useAuth()
  const [etapas, setEtapas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingEtapa, setSavingEtapa] = useState(null)
  const [nombres, setNombres] = useState({})
  const [corrigiendo, setCorrigiendo] = useState(null)
  const [editando, setEditando] = useState(false)

  useEffect(() => {
    fetchProfiles().then(({ data }) => setNombres(Object.fromEntries((data || []).map((p) => [p.id, p.full_name]))))
  }, [])

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchOrdenEtapas(orderId)
    if (fetchError) {
      setError(fetchError)
    } else {
      setEtapas(data || [])
      setError(null)
    }
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdvance(etapa, nuevoEstado) {
    setSavingEtapa(etapa)
    setError(null)
    const { error: updateError } = await updateOrdenEtapa(orderId, etapa, nuevoEstado)
    setSavingEtapa(null)

    if (updateError) {
      setError(updateError)
      return
    }
    load()
    onUpdated?.()
  }

  // Una etapa marcada por error se regresa aquí: solo admin_fabrica y
  // admin_general (el servidor lo permite solo a ellos). No deshace lo que el
  // cierre haya registrado aparte (tela descontada en corte, cantidades de
  // terminado, reporte de impresión).
  const puedeRegresar = role === 'admin_fabrica' || role === 'admin_general'

  function handleRegresar(et, nuevoEstado) {
    const nombre = ETAPA_LABELS[et.etapa] || et.etapa
    const aviso =
      nuevoEstado === 'pendiente'
        ? `¿Regresar ${nombre} a "pendiente"? Se borran sus horas de inicio y fin, y vuelve a salirle a la estación como no empezada.`
        : `¿Regresar ${nombre} a "en proceso"? Se borra su hora de fin y la estación la verá otra vez como empezada.`
    if (!window.confirm(aviso)) return
    handleAdvance(et.etapa, nuevoEstado)
  }

  if (loading) return null
  if (etapas.length === 0 && !canEditEtapasOrden(role)) return null

  return (
    <div>
      <div className="section-header">
        <h3 className="section-title section-title--small" style={{ marginBottom: 0 }}>
          Etapas de producción
        </h3>
        {canEditEtapasOrden(role) && !editando && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditando(true)}>
            Editar etapas
          </button>
        )}
      </div>
      <p className="page-subtitle" style={{ marginTop: 4, marginBottom: 10 }}>
        Cada etapa avanza por su cuenta — pueden estar varias en proceso al mismo tiempo.
      </p>

      {editando && (
        <EditarEtapas
          orderId={orderId}
          etapas={etapas}
          onCancelar={() => setEditando(false)}
          onListo={() => {
            setEditando(false)
            load()
            onUpdated?.()
          }}
        />
      )}

      {!editando && (
      <div className="document-list">
        {etapas.map((et) => {
          const canChange = canChangeEtapa(role, et.etapa)
          const next = NEXT_ESTADO[et.estado]
          const estadoStyle = ETAPA_ESTADO_COLORS[et.estado] || {}
          const tiempoReal = medirEtapa(et).minutos

          return (
            <div key={et.etapa} className="document-row">
              <div>
                <span className="document-row__label">{ETAPA_LABELS[et.etapa] || et.etapa}</span>
                <p className="pending-card__garment" style={{ marginTop: 2 }}>
                  <span className="badge" style={{ background: estadoStyle.color, color: estadoStyle.textColor }}>
                    {ETAPA_ESTADO_LABELS[et.estado] || et.estado}
                  </span>
                </p>
                {(et.iniciado_en || et.completado_en) && (
                  <p className="document-row__empty" style={{ marginTop: 2 }}>
                    {et.iniciado_en && `Inició: ${formatDateTime(et.iniciado_en)}`}
                    {et.iniciado_en && et.completado_en ? ' · ' : ''}
                    {et.completado_en && `Terminó: ${formatDateTime(et.completado_en)}`}
                    {nombres[et.responsable_id] ? ` · ${nombres[et.responsable_id]}` : ''}
                  </p>
                )}
                {reporteDeEtapa(et) && (
                  // V146 — lo que reportó sublimado al marcar "Impresa".
                  <p className="document-row__empty" style={{ marginTop: 2 }}>
                    Trazo: {reporteDeEtapa(et).largo} m · Tinta: {formatMl(reporteDeEtapa(et).total)} (
                    {TINTAS.map((t) => `${t.label.toLowerCase()} ${reporteDeEtapa(et)[t.key]}`).join(', ')})
                  </p>
                )}
                {et.estado === 'en_proceso' && et.iniciado_en && (
                  <p style={{ marginTop: 4 }}>
                    <EtapaCronometro etapa={et} compacto />
                  </p>
                )}
                {et.estado === 'completado' && tiempoReal != null && (
                  <p className="document-row__empty" style={{ marginTop: 2 }}>
                    Tiempo real: <strong>{formatMinutosHabiles(tiempoReal)} hábiles</strong>
                  </p>
                )}
                {puedeRegresar && et.estado !== 'pendiente' && (
                  // Corrección de una etapa marcada por error (solo administradores).
                  <p style={{ marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {et.estado === 'completado' && (
                      <button type="button" className="etapa-corregir-link" disabled={savingEtapa === et.etapa} onClick={() => handleRegresar(et, 'en_proceso')}>
                        Regresar a "en proceso"
                      </button>
                    )}
                    <button type="button" className="etapa-corregir-link" disabled={savingEtapa === et.etapa} onClick={() => handleRegresar(et, 'pendiente')}>
                      Regresar a "pendiente"
                    </button>
                  </p>
                )}
                {et.estado === 'completado' && role === 'admin_general' && corrigiendo !== et.etapa && (
                  <button type="button" className="etapa-corregir-link" onClick={() => setCorrigiendo(et.etapa)}>
                    Corregir horas
                  </button>
                )}
                {corrigiendo === et.etapa && (
                  <CorregirTiempos
                    orderId={orderId}
                    etapa={et}
                    onCancelar={() => setCorrigiendo(null)}
                    onListo={() => {
                      setCorrigiendo(null)
                      load()
                    }}
                  />
                )}
              </div>
              {canChange && next && (
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  disabled={savingEtapa === et.etapa}
                  onClick={() => handleAdvance(et.etapa, next)}
                >
                  {savingEtapa === et.etapa
                    ? 'Guardando…'
                    : next === 'en_proceso'
                      ? 'Iniciar'
                      : 'Marcar completado'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      )}

      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}
