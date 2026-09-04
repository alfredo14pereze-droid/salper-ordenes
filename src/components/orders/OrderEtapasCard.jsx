import { useCallback, useEffect, useState } from 'react'
import { fetchOrdenEtapas, updateOrdenEtapa } from '../../services/ordersService'
import { useAuth } from '../../contexts/AuthContext'
import { canChangeEtapa } from '../../utils/permissions'
import { ETAPA_LABELS, ETAPA_ESTADO_LABELS, ETAPA_ESTADO_COLORS } from '../../lib/constants'
import { formatDateTime } from '../../utils/dates'

// El siguiente estado en el ciclo pendiente -> en_proceso -> completado.
// Un rol de etapa solo avanza, nunca retrocede desde aquí (admin_fabrica/
// admin_general sí pueden, con el botón de "regresar" aparte).
const NEXT_ESTADO = { pendiente: 'en_proceso', en_proceso: 'completado', completado: null }

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
                  </p>
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
