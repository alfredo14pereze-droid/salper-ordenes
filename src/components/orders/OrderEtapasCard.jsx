import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { fetchOrdenEtapas, updateOrdenEtapa, corregirTiemposEtapa } from '../../services/ordersService'
import { fetchProfiles } from '../../services/usersService'
import { useAuth } from '../../contexts/AuthContext'
import { canChangeEtapa } from '../../utils/permissions'
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

  if (loading) return null
  if (etapas.length === 0) return null

  return (
    <div>
      <h3 className="section-title section-title--small">Etapas de producción</h3>
      <p className="page-subtitle" style={{ marginTop: -6, marginBottom: 10 }}>
        Cada etapa avanza por su cuenta — pueden estar varias en proceso al mismo tiempo.
      </p>

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
                {et.estado === 'en_proceso' && et.iniciado_en && (
                  <p style={{ marginTop: 4 }}>
                    <EtapaCronometro iniciadoEn={et.iniciado_en} compacto />
                  </p>
                )}
                {et.estado === 'completado' && tiempoReal != null && (
                  <p className="document-row__empty" style={{ marginTop: 2 }}>
                    Tiempo real: <strong>{formatMinutosHabiles(tiempoReal)} hábiles</strong>
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

      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}
