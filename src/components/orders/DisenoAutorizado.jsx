import { useCallback, useEffect, useState } from 'react'
import { autorizarDiseno, fetchOrdenEtapas } from '../../services/ordersService'
import { canAutorizarDiseno } from '../../utils/permissions'
import { useAuth } from '../../contexts/AuthContext'
import { ETAPA_ESTADO_COLORS } from '../../lib/constants'
import { formatDateTime } from '../../utils/dates'

// V165 — "Diseño autorizado" de una orden de sublimación. Sin autorizar: el
// botón (la orden pasa a pendientes de impresión). Autorizado: badge verde
// con quién y cuándo, y "Quitar autorización" mientras la impresión siga
// pendiente. `impresion` es la fila de la etapa impresion (puede faltar).
export default function DisenoAutorizado({ order, impresion, sinDisenoFinal, onCambio, className = '' }) {
  const { role } = useAuth()
  const puede = canAutorizarDiseno(role)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (order.order_type_key !== 'sublimacion') return null

  const impEstado = impresion?.estado || 'pendiente'
  const autorizado = !!order.diseno_autorizado_en || impEstado !== 'pendiente'

  async function cambiar(valor) {
    if (!valor && !window.confirm('¿Quitar la autorización del diseño? La orden regresa a "Pendientes de diseño".')) return
    setBusy(true)
    setError(null)
    const { error: err } = await autorizarDiseno(order.id, valor)
    setBusy(false)
    if (err) return setError(err)
    onCambio?.()
  }

  const verde = ETAPA_ESTADO_COLORS.completado
  return (
    <div className={'diseno-autorizado ' + className}>
      {autorizado ? (
        <>
          <span className="badge" style={{ background: verde.color, color: verde.textColor }}>✓ Diseño autorizado</span>
          {order.diseno_autorizado_en && (
            <span className="pantone-hint">
              {order.diseno_autorizado_nombre ? `${order.diseno_autorizado_nombre} · ` : ''}
              {formatDateTime(order.diseno_autorizado_en)}
            </span>
          )}
          {puede && order.diseno_autorizado_en && impEstado === 'pendiente' && (
            <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => cambiar(false)}>
              Quitar autorización
            </button>
          )}
        </>
      ) : puede ? (
        <>
          {sinDisenoFinal && <span className="pantone-hint">Todavía no hay diseño final subido.</span>}
          <button type="button" className="btn estacion-btn estacion-btn--iniciar" disabled={busy} onClick={() => cambiar(true)}>
            {busy ? 'Guardando…' : 'Diseño autorizado'}
          </button>
        </>
      ) : (
        <span className="pantone-hint">Diseño sin autorizar.</span>
      )}
      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}

// Para el detalle de la orden: carga la etapa de impresión por su cuenta.
export function DisenoAutorizadoCard({ order, onCambio }) {
  const [impresion, setImpresion] = useState(null)
  const cargar = useCallback(async () => {
    const { data } = await fetchOrdenEtapas(order.id)
    setImpresion((data || []).find((e) => e.etapa === 'impresion') || null)
  }, [order.id])
  useEffect(() => {
    cargar()
  }, [cargar])
  if (order.order_type_key !== 'sublimacion') return null
  return (
    <section className="card">
      <h3 className="section-title section-title--small">Diseño</h3>
      <DisenoAutorizado
        order={order}
        impresion={impresion}
        onCambio={() => {
          cargar()
          onCambio?.()
        }}
      />
    </section>
  )
}
