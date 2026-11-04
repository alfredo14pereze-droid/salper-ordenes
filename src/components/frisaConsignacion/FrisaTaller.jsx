import { useMemo, useState } from 'react'
import { formatFecha, formatNum, ordenarProductos } from '../../utils/frisaConsignacion'
import { terminarOT } from '../../services/frisaConsignacionService'
import { PanelFecha } from './FrisaOrdenesCompra'

// V181 — Órdenes de taller: qué hay que producir para cada OC. Al terminar
// una, lo producido entra a la bodega SALPER y la OC queda lista para armar.
export default function FrisaTaller({ datos, recargar }) {
  const [ver, setVer] = useState('abierta')
  const [terminando, setTerminando] = useState(null)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const oc = useMemo(() => Object.fromEntries(datos.ordenes.map((o) => [o.id, o])), [datos])
  const planta = useMemo(() => Object.fromEntries(datos.plantas.map((p) => [p.id, p])), [datos])
  const prod = useMemo(() => Object.fromEntries(datos.productos.map((p) => [p.id, p])), [datos])

  const lista = datos.talleres
    .filter((t) => t.estado === ver)
    .sort((a, b) => (ver === 'abierta' ? ((a.fecha_compromiso || '9') < (b.fecha_compromiso || '9') ? -1 : 1) : (a.terminada_fecha < b.terminada_fecha ? 1 : -1)))

  // Total a producir por SKU de las abiertas (para el taller).
  const totales = useMemo(() => {
    const abiertas = new Set(datos.talleres.filter((t) => t.estado === 'abierta').map((t) => t.id))
    const m = {}
    for (const l of datos.otLineas) if (abiertas.has(l.ot_id)) m[l.producto_id] = (m[l.producto_id] || 0) + l.cantidad
    return ordenarProductos(Object.keys(m).map((id) => prod[id]).filter(Boolean)).map((p) => ({ p, n: m[p.id] }))
  }, [datos, prod])

  async function terminar(ot, { fecha }) {
    setGuardando(true)
    setError(null)
    const { error: e } = await terminarOT(ot.id, fecha)
    setGuardando(false)
    if (e) return setError(e.message)
    setTerminando(null)
    recargar()
  }

  return (
    <div>
      <div className="order-filters__chips frisa__chips">
        {[['abierta', 'Abiertas'], ['terminada', 'Terminadas'], ['cancelada', 'Canceladas']].map(([k, label]) => (
          <button key={k} type="button" className={'chip' + (ver === k ? ' chip--active' : '')} onClick={() => setVer(k)}>
            {label} <span className="frisa__sub">{datos.talleres.filter((t) => t.estado === k).length}</span>
          </button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}

      {ver === 'abierta' && totales.length > 0 && (
        <details className="card frisa-panel">
          <summary><strong>Total a producir de todas las abiertas</strong> ({formatNum(totales.reduce((s, x) => s + x.n, 0))} pzas)</summary>
          <div className="revision__tabla-wrap">
            <table className="simple-table frisa-tabla">
              <tbody>{totales.map(({ p, n }) => <tr key={p.id}><td><strong>{p.sku}</strong> <span className="frisa__sub">{p.nombre}</span></td><td className="num">{formatNum(n)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      )}

      {lista.length === 0 ? <p className="frisa__sub">No hay órdenes de taller aquí.</p> : lista.map((t) => {
        const o = oc[t.oc_id]
        const ls = ordenarProductos(datos.otLineas.filter((l) => l.ot_id === t.id).map((l) => ({ ...prod[l.producto_id], _n: l.cantidad })).filter((x) => x.id))
        return (
          <div key={t.id} className="card frisa-oc">
            <div className="frisa-oc__cabeza frisa-oc__cabeza--fija">
              <span className="frisa-oc__num">{t.folio}</span>
              <span className="frisa-oc__planta">OC {o?.numero} · {planta[o?.planta_id]?.nombre}</span>
              <span className="frisa__sub frisa-oc__meta">
                {formatNum(ls.reduce((s, x) => s + x._n, 0))} pzas
                {t.fecha_compromiso ? ` · compromiso ${formatFecha(t.fecha_compromiso)}` : ''}
                {t.terminada_fecha ? ` · terminada ${formatFecha(t.terminada_fecha)}` : ''}
              </span>
            </div>
            <div className="frisa-oc__detalle">
              <p className="frisa-ot__lineas">{ls.map((x) => `${x.sku} ×${x._n}`).join(' · ')}</p>
              {t.estado === 'abierta' && (terminando === t.id ? (
                <PanelFecha titulo={`Terminar ${t.folio}: lo producido entra a la bodega SALPER`} boton="Terminar orden de taller" guardando={guardando}
                  onCancelar={() => setTerminando(null)} onGuardar={(x) => terminar(t, x)} />
              ) : (
                <button type="button" className="btn btn--primary btn--small" onClick={() => setTerminando(t.id)}>Terminar</button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
