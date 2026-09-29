import { useEffect, useState } from 'react'
import { usePendientes } from '../hooks/usePendientes'
import PendienteCard from '../components/pendientes/PendienteCard'
import PendienteForm from '../components/pendientes/PendienteForm'
import TiposTrabajoModal from '../components/pendientes/TiposTrabajoModal'
import EntregarModal from '../components/pendientes/EntregarModal'
import EstacionPendientesPage from './EstacionPendientesPage'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { cambiarEstado, cambiarEstadoLote, SIGUIENTE, sinRecibirAlerta } from '../services/pendientesService'
import { useAuth } from '../contexts/AuthContext'
import { pfEsTienda, pfEsFabrica, canManageTiposPendiente, canMarcarEntregado, canViewPendientes, esFabricaSoloLectura } from '../utils/permissions'
import { estacionDeRol } from '../config/vistasPorRol'
import RequireRole from '../components/common/RequireRole'

// Bandejas por rol (V78). tienda: lo que mandó y espera; fábrica: lo que le toca.
// V85 — sin filtros ni buscador: no son tantos pendientes a la vez como para
// necesitarlos; las bandejas ya bastan para ubicar cada uno.
// V94 — "Cerrados" se partió en dos: los de cliente que ya llegaron a
// recibido_en_tienda todavía no están cerrados de verdad (falta
// entregarlos), así que viven en "Por entregar" hasta que pasan por
// pf_marcar_entregado. `filtro` es un predicado extra sobre el mismo
// estado (ambas bandejas comparten recibido_en_tienda).
const BANDEJAS = {
  tienda: [
    { key: 'camino', label: 'En camino a fábrica', estados: ['enviado_a_fabrica'] },
    { key: 'fabrica', label: 'En fábrica', estados: ['recibido_en_fabrica', 'listo_para_regresar'] },
    { key: 'regreso', label: 'De regreso — por recibir', estados: ['enviado_a_tienda'] },
    { key: 'entregar', label: 'Por entregar', estados: ['recibido_en_tienda'], filtro: (p) => p.es_para_cliente, ordenAntiguedad: true },
    {
      key: 'cerrados',
      label: 'Cerrados',
      estados: ['recibido_en_tienda', 'entregado'],
      filtro: (p) => !p.es_para_cliente || p.estado === 'entregado',
    },
  ],
  fabrica: [
    { key: 'recibir', label: 'Por recibir', estados: ['enviado_a_fabrica'] },
    { key: 'hacer', label: 'Por hacer', estados: ['recibido_en_fabrica'] },
    { key: 'listo', label: 'Listo para regresar', estados: ['listo_para_regresar'] },
    { key: 'enviados', label: 'Enviados a tienda', estados: ['enviado_a_tienda', 'recibido_en_tienda', 'entregado'] },
  ],
}

// V97 — bordado/producción (costura) ven una pantalla mucho más chica
// (solo su tipo de trabajo, sin bandejas — ver EstacionPendientesPage.jsx);
// corte/sublimado ya no tienen nada que ver aquí. terminado y todos los
// demás roles siguen en PendientesContent, sin cambios. El branch vive en
// este wrapper (no dentro de PendientesContent) para no romper las reglas
// de hooks.
export default function PendientesPage() {
  const { role } = useAuth()
  const estacion = estacionDeRol(role)
  if (estacion?.pendientesTipo) return <EstacionPendientesPage tipoNombre={estacion.pendientesTipo} />
  return (
    <RequireRole allow={canViewPendientes}>
      <PendientesContent />
    </RequireRole>
  )
}

function PendientesContent() {
  const { role } = useAuth()
  const { items, loading, error, refresh } = usePendientes()
  // admin_fabrica_lectura no aparece en pfEsFabrica (esa gobierna quién puede
  // confirmar), pero para elegir la bandeja por default debe comportarse
  // igual que admin_fabrica: fábrica es su dominio.
  const soloFabrica = (pfEsFabrica(role) || esFabricaSoloLectura(role)) && !pfEsTienda(role)
  const [modo, setModo] = useState(soloFabrica ? 'fabrica' : 'tienda')
  const bandejas = BANDEJAS[modo]
  const [tab, setTab] = useState(bandejas[0].key)
  const [seleccion, setSeleccion] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [showTipos, setShowTipos] = useState(false)
  const [entregando, setEntregando] = useState(null)
  const puedeEntregar = canMarcarEntregado(role)

  useEffect(() => {
    setTab(BANDEJAS[modo][0].key)
    setSeleccion(new Set())
  }, [modo])
  useEffect(() => setSeleccion(new Set()), [tab])

  const actual = bandejas.find((b) => b.key === tab) || bandejas[0]
  function filtrarBandeja(b) {
    return items.filter((p) => b.estados.includes(p.estado) && (!b.filtro || b.filtro(p)))
  }
  const lista = filtrarBandeja(actual)
  if (actual.ordenAntiguedad) {
    lista.sort((a, b) => new Date(a.estado_desde) - new Date(b.estado_desde))
  }
  const cuenta = (b) => filtrarBandeja(b).length
  const alertas = items.filter(sinRecibirAlerta).length

  function puedeActuar(p) {
    const sig = SIGUIENTE[p.estado]
    if (!sig) return false
    return sig.quien === 'fabrica' ? pfEsFabrica(role) : pfEsTienda(role)
  }

  const seleccionables = lista.filter(puedeActuar)
  const sigGrupo = seleccionables[0] ? SIGUIENTE[seleccionables[0].estado] : null

  function toggle(id) {
    setSeleccion((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function confirmarUno(p) {
    setBusy(true)
    setMsg(null)
    const { error: e } = await cambiarEstado(p.id, SIGUIENTE[p.estado].next)
    setBusy(false)
    if (e) setMsg({ error: true, text: e.message })
    else {
      setMsg({ text: `${p.folio}: listo.` })
      refresh()
    }
  }

  async function confirmarLote() {
    setBusy(true)
    setMsg(null)
    const ids = [...seleccion]
    const { data, error: e } = await cambiarEstadoLote(ids, sigGrupo.next)
    setBusy(false)
    if (e) {
      setMsg({ error: true, text: e.message })
      return
    }
    const omit = data?.omitidos || []
    setMsg({
      text: `${data.cambiados} confirmado${data.cambiados === 1 ? '' : 's'}.` + (omit.length ? ` No se pudieron: ${omit.map((o) => `${o.folio} (${o.motivo})`).join('; ')}` : ''),
      error: omit.length > 0,
    })
    setSeleccion(new Set())
    refresh()
  }

  if (loading) return <Loading label="Cargando pendientes…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page page--narrow pf-page">
      <div className="section-header">
        <h2 className="section-title">Pendientes tienda ↔ fábrica</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canManageTiposPendiente(role) && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowTipos(true)}>
              Tipos de trabajo
            </button>
          )}
          {pfEsTienda(role) && (
            <button type="button" className="btn btn--primary" onClick={() => setShowForm(true)}>
              + Nuevo pendiente
            </button>
          )}
        </div>
      </div>
      <p className="page-subtitle">Trabajos chicos que la tienda manda a la fábrica y la fábrica regresa, con doble confirmación.</p>

      {role === 'admin_general' && (
        <div className="pf-modo">
          <button type="button" className={'btn btn--small ' + (modo === 'tienda' ? 'btn--primary' : 'btn--ghost')} onClick={() => setModo('tienda')}>
            Vista tienda
          </button>
          <button type="button" className={'btn btn--small ' + (modo === 'fabrica' ? 'btn--primary' : 'btn--ghost')} onClick={() => setModo('fabrica')}>
            Vista fábrica
          </button>
        </div>
      )}

      {alertas > 0 && <p className="pf-alerta pf-alerta--banner">⚠ {alertas} pendiente{alertas === 1 ? '' : 's'} enviado{alertas === 1 ? '' : 's'} a fábrica sin recibir desde hace más de 1 día</p>}

      <div className="pf-tabs" role="tablist">
        {bandejas.map((b) => (
          <button key={b.key} type="button" role="tab" aria-selected={b.key === actual.key} className={'pf-tab' + (b.key === actual.key ? ' pf-tab--on' : '')} onClick={() => setTab(b.key)}>
            {b.label} <span className="pf-tab__n">{cuenta(b)}</span>
          </button>
        ))}
      </div>

      {seleccionables.length > 1 && (
        <label className="pf-selall">
          <input
            type="checkbox"
            checked={seleccion.size === seleccionables.length}
            onChange={(e) => setSeleccion(e.target.checked ? new Set(seleccionables.map((p) => p.id)) : new Set())}
          />
          Seleccionar todos ({seleccionables.length})
        </label>
      )}

      {msg && <p className={msg.error ? 'form-error' : 'fin-ok'}>{msg.text}</p>}

      {lista.length === 0 ? (
        <EmptyState>No hay pendientes en “{actual.label}”.</EmptyState>
      ) : (
        <div className="pf-list">
          {lista.map((p) => (
            <PendienteCard
              key={p.id}
              p={p}
              puedeActuar={puedeActuar(p)}
              puedeEntregar={puedeEntregar}
              selected={seleccion.has(p.id)}
              onToggle={toggle}
              onConfirm={confirmarUno}
              onEntregar={setEntregando}
              busy={busy}
            />
          ))}
        </div>
      )}

      {seleccion.size > 0 && sigGrupo && (
        <div className="pf-bar">
          <span>{seleccion.size} seleccionado{seleccion.size === 1 ? '' : 's'}</span>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={confirmarLote}>
            {busy ? 'Confirmando…' : `${sigGrupo.label} (${seleccion.size})`}
          </button>
        </div>
      )}

      {showForm && (
        <PendienteForm
          onClose={() => setShowForm(false)}
          onSaved={(p) => {
            setShowForm(false)
            setMsg({ text: `${p.folio} enviado a fábrica.` })
            refresh()
          }}
        />
      )}
      {showTipos && <TiposTrabajoModal onClose={() => setShowTipos(false)} />}
      {entregando && (
        <EntregarModal
          pendiente={entregando}
          onClose={() => setEntregando(null)}
          onDone={() => {
            setMsg({ text: `${entregando.folio}: entregado.` })
            setEntregando(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
