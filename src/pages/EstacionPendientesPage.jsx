import { resumenPrendas } from '../utils/pendientesPago'
import { useState } from 'react'
import { usePendientes } from '../hooks/usePendientes'
import { cambiarEstado, SIGUIENTE, esTrabajoDe, marcarParte, partesDe } from '../services/pendientesService'
import { Loading, ErrorState, EmptyState } from '../components/common/States'

// V97 — Pendientes para bordado/producción (costura): a diferencia de
// PendientesPage.jsx (bandejas completas, para tienda/terminado/admin),
// aquí solo se ve la lista de "por hacer" (recibido_en_fabrica) YA
// filtrada al tipo de trabajo de esta estación — nada de bandejas ni
// selección múltiple, un botón grande por tarjeta y ya.
export default function EstacionPendientesPage({ tipoNombre }) {
  const { items, loading, error, refresh } = usePendientes()
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)

  // V134 — también los tipos compuestos que llevan mi parte (p. ej. "Arreglo y
  // bordado") mientras yo no la haya marcado.
  const lista = items.filter((p) => esTrabajoDe(p, tipoNombre))

  async function confirmar(p) {
    setBusy(p.id)
    setMsg(null)
    const { error: err } =
      partesDe(p).length > 0 ? await marcarParte(p.id, tipoNombre) : await cambiarEstado(p.id, SIGUIENTE[p.estado].next)
    setBusy(null)
    if (err) setMsg({ error: true, text: err.message })
    else {
      setMsg({ text: `${p.folio}: listo.` })
      refresh()
    }
  }

  if (loading) return <Loading label="Cargando pendientes…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page estacion-page">
      <h2 className="section-title">Pendientes de {tipoNombre.toLowerCase()}</h2>
      {msg && <p className={msg.error ? 'form-error' : 'fin-ok'}>{msg.text}</p>}
      {lista.length === 0 ? (
        <EmptyState>No tienes pendientes de {tipoNombre.toLowerCase()} por hacer ahora mismo 🎉</EmptyState>
      ) : (
        <div className="estacion-list">
          {lista.map((p) => (
            <div key={p.id} className="estacion-card" style={{ cursor: 'default' }}>
              <span className="estacion-card__folio">{p.folio}</span>
              {partesDe(p).length > 0 && (
                <span className="estacion-card__due">
                  {p.tipo.nombre}: tú marcas {tipoNombre.toLowerCase()}
                </span>
              )}
              <span className="estacion-card__prendas">{p.descripcion}</span>
              <span className="estacion-card__due">
                {resumenPrendas(p)}
              </span>
              <button
                type="button"
                className="btn btn--primary estacion-btn"
                style={{ marginTop: 10 }}
                disabled={busy === p.id}
                onClick={() => confirmar(p)}
              >
                {busy === p.id ? 'Guardando…' : 'Marcar listo'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
