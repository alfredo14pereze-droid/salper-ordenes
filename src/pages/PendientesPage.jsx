import { useEffect, useMemo, useState } from 'react'
import { usePendientes } from '../hooks/usePendientes'
import PendienteCard from '../components/pendientes/PendienteCard'
import PendienteForm from '../components/pendientes/PendienteForm'
import TiposTrabajoModal from '../components/pendientes/TiposTrabajoModal'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { fetchTipos, cambiarEstado, cambiarEstadoLote, SIGUIENTE, sinRecibirAlerta } from '../services/pendientesService'
import { useAuth } from '../contexts/AuthContext'
import { pfEsTienda, pfEsFabrica, canManageTiposPendiente } from '../utils/permissions'

// Bandejas por rol (V78). tienda: lo que mandó y espera; fábrica: lo que le toca.
const BANDEJAS = {
  tienda: [
    { key: 'camino', label: 'En camino a fábrica', estados: ['enviado_a_fabrica'] },
    { key: 'fabrica', label: 'En fábrica', estados: ['recibido_en_fabrica', 'listo_para_regresar'] },
    { key: 'regreso', label: 'De regreso — por recibir', estados: ['enviado_a_tienda'] },
    { key: 'problema', label: 'Con problema', estados: ['con_problema'] },
    { key: 'cerrados', label: 'Cerrados', estados: ['recibido_en_tienda'] },
  ],
  fabrica: [
    { key: 'recibir', label: 'Por recibir', estados: ['enviado_a_fabrica'] },
    { key: 'hacer', label: 'Por hacer', estados: ['recibido_en_fabrica'] },
    { key: 'listo', label: 'Listo para regresar', estados: ['listo_para_regresar'] },
    { key: 'problema', label: 'Con problema', estados: ['con_problema'] },
    { key: 'enviados', label: 'Enviados a tienda', estados: ['enviado_a_tienda', 'recibido_en_tienda'] },
  ],
}

export default function PendientesPage() {
  const { role } = useAuth()
  const { items, loading, error, refresh } = usePendientes()
  const soloFabrica = pfEsFabrica(role) && !pfEsTienda(role)
  const [modo, setModo] = useState(soloFabrica ? 'fabrica' : 'tienda')
  const bandejas = BANDEJAS[modo]
  const [tab, setTab] = useState(bandejas[0].key)
  const [tipos, setTipos] = useState([])
  const [fTipo, setFTipo] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fPara, setFPara] = useState('')
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [buscar, setBuscar] = useState('')
  const [seleccion, setSeleccion] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [showTipos, setShowTipos] = useState(false)

  useEffect(() => {
    fetchTipos({ soloActivos: false }).then(({ data }) => setTipos(data || []))
  }, [showTipos])

  useEffect(() => {
    setTab(BANDEJAS[modo][0].key)
    setSeleccion(new Set())
  }, [modo])
  useEffect(() => setSeleccion(new Set()), [tab])

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase().replace(/^p-?/, '')
    return items.filter((p) => {
      if (fTipo && p.tipo_id !== fTipo) return false
      if (fPara === 'cliente' && !p.es_para_cliente) return false
      if (fPara === 'tienda' && p.es_para_cliente) return false
      if (fCliente && !`${p.cliente_nombre || ''} ${p.cliente_telefono || ''}`.toLowerCase().includes(fCliente.trim().toLowerCase())) return false
      const creado = (p.created_at || '').slice(0, 10)
      if (fDesde && creado < fDesde) return false
      if (fHasta && creado > fHasta) return false
      if (q && !p.folio.toLowerCase().replace('p-', '').replace(/^0+/, '').includes(q.replace(/^0+/, ''))) return false
      return true
    })
  }, [items, fTipo, fCliente, fPara, fDesde, fHasta, buscar])

  const actual = bandejas.find((b) => b.key === tab) || bandejas[0]
  const lista = filtrados.filter((p) => actual.estados.includes(p.estado))
  const cuenta = (b) => filtrados.filter((p) => b.estados.includes(p.estado)).length
  const alertas = filtrados.filter(sinRecibirAlerta).length

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

      <div className="pf-filtros">
        <input className="input" placeholder="Buscar folio (P-0001)" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <select className="input" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <select className="input" value={fPara} onChange={(e) => setFPara(e.target.value)}>
          <option value="">Cliente y tienda</option>
          <option value="cliente">Solo de clientes</option>
          <option value="tienda">Solo de la tienda</option>
        </select>
        <input className="input" placeholder="Cliente (nombre o teléfono)" value={fCliente} onChange={(e) => setFCliente(e.target.value)} />
        <label className="pf-filtros__fecha">
          Enviado desde
          <input type="date" className="input" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
        </label>
        <label className="pf-filtros__fecha">
          hasta
          <input type="date" className="input" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
        </label>
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
            <PendienteCard key={p.id} p={p} puedeActuar={puedeActuar(p)} selected={seleccion.has(p.id)} onToggle={toggle} onConfirm={confirmarUno} busy={busy} />
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
    </div>
  )
}
