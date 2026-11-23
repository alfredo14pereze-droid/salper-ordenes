import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { ErrorState, Loading, EmptyState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canCargarAtr, canEntregarAtr, canOcAtr, canTallerAtr, canVerAtr } from '../utils/permissions'
import { fetchAtrExistencias, fetchAtrProductos } from '../services/atrService'
import { normalizar, ordenTalla } from '../utils/atrCarga'
import AtrHistorialModal from '../components/atr/AtrHistorialModal'
import AtrEntregaModal from '../components/atr/AtrEntregaModal'
import AtrAjusteModal from '../components/atr/AtrAjusteModal'
import AtrOcLista from '../components/atr/AtrOcLista'
import AtrFaltantes from '../components/atr/AtrFaltantes'
import '../components/atr/atr.css'
import AyudaModulo from '../components/common/AyudaModulo'

// V209/V210 — Inventario de batas de ATR. Existencia = suma de movimientos
// (vista atr_existencias). Clic en una fila → su historial.
export default function AtrPage() {
  return (
    <RequireRole allow={canVerAtr}>
      <AtrPestanas />
    </RequireRole>
  )
}

// V215 — pestañas: Inventario | Órdenes de compra (?tab=oc)
const PESTANAS = [
  ['inventario', 'Inventario'],
  ['oc', 'Órdenes de compra'],
  ['faltan', 'Qué nos falta'],
]

function AtrPestanas() {
  const { role } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = PESTANAS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'inventario'
  return (
    <div className="page atr">
      <div className="atr-pestanas" role="tablist">
        {PESTANAS.map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k}
            className={'atr-pestana' + (tab === k ? ' is-activa' : '')}
            onClick={() => setParams(k === 'inventario' ? {} : { tab: k }, { replace: true })}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'oc' ? (
        <>
          <div className="section-header">
            <h2 className="section-title">Órdenes de compra ATR <AyudaModulo id="atr" /></h2>
          </div>
          <AtrOcLista puedeSubir={canOcAtr(role)} />
        </>
      ) : tab === 'faltan' ? (
        <>
          <div className="section-header">
            <h2 className="section-title">Qué nos falta <AyudaModulo id="atr" /></h2>
          </div>
          <AtrFaltantes puedeTaller={canTallerAtr(role)} />
        </>
      ) : (
        <Atr />
      )}
    </div>
  )
}

function Atr() {
  const { role } = useAuth()
  const [productos, setProductos] = useState(null)
  const [existencias, setExistencias] = useState(null)
  const [error, setError] = useState(null)
  const [busca, setBusca] = useState('')
  const [fProducto, setFProducto] = useState('')
  const [verCeros, setVerCeros] = useState(false)
  const [historial, setHistorial] = useState(null) // fila
  const [entrega, setEntrega] = useState(false)
  const [ajuste, setAjuste] = useState(null) // {} o fila

  const cargar = useCallback(async () => {
    setError(null)
    const [p, e] = await Promise.all([fetchAtrProductos(), fetchAtrExistencias()])
    if (p.error || e.error) return setError(p.error || e.error)
    setProductos(p.data)
    setExistencias(e.data)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const filas = useMemo(() => {
    if (!existencias) return []
    const q = normalizar(busca)
    return existencias
      .filter((x) => verCeros || x.existencia !== 0)
      .filter((x) => !fProducto || x.producto_id === fProducto)
      .filter((x) => !q || normalizar(`${x.producto} ${x.talla} ${x.color}`).includes(q))
      .sort((a, b) => a.producto.localeCompare(b.producto, 'es') || ordenTalla(a.talla) - ordenTalla(b.talla))
  }, [existencias, busca, fProducto, verCeros])

  const total = filas.reduce((s, x) => s + x.existencia, 0)

  if (error) return <ErrorState error={error} onRetry={cargar} />
  if (!existencias || !productos) return <Loading />

  const listo = () => {
    setEntrega(false)
    setAjuste(null)
    cargar()
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Inventario ATR <AyudaModulo id="atr" /></h2>
        <div className="atr-acciones">
          {canCargarAtr(role) && (
            <>
              <Link to="/atr/carga" className="btn btn--ghost btn--small">Carga inicial</Link>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setAjuste({})}>Ajuste</button>
            </>
          )}
          {canEntregarAtr(role) && (
            <button type="button" className="btn btn--primary" onClick={() => setEntrega(true)}>Registrar entrega a ATR</button>
          )}
        </div>
      </div>

      <div className="atr-filtros">
        <input className="input" placeholder="Buscar color, talla…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="input" value={fProducto} onChange={(e) => setFProducto(e.target.value)}>
          <option value="">Todos los productos</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <label className="atr-check">
          <input type="checkbox" checked={verCeros} onChange={(e) => setVerCeros(e.target.checked)} /> Ver tallas en 0
        </label>
      </div>

      {existencias.length === 0 ? (
        <EmptyState>
          Todavía no hay inventario de ATR.{canCargarAtr(role) ? <> Empieza con la <Link to="/atr/carga">carga inicial</Link>.</> : null}
        </EmptyState>
      ) : (
        <>
          <p className="atr-muted atr-conteo">{filas.length} líneas · <strong>{total.toLocaleString('es-MX')}</strong> batas</p>
          <div className="atr-tabla-wrap">
            <table className="simple-table atr-tabla">
              <thead>
                <tr><th>Producto</th><th>Talla</th><th>Color</th><th className="atr-num">Existencia</th></tr>
              </thead>
              <tbody>
                {filas.map((x) => (
                  <tr key={x.producto_id + x.talla} className="atr-tabla__fila" onClick={() => setHistorial(x)}>
                    <td>{x.producto}</td>
                    <td>{x.talla}</td>
                    <td>{x.color}</td>
                    <td className={'atr-num' + (x.existencia < 0 ? ' atr-negativo' : '')}>{x.existencia}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {historial && (
        <AtrHistorialModal
          fila={historial}
          onClose={() => setHistorial(null)}
          onAjuste={canCargarAtr(role) ? () => { setAjuste(historial); setHistorial(null) } : null}
        />
      )}
      {entrega && <AtrEntregaModal productos={productos} existencias={existencias} onClose={() => setEntrega(false)} onListo={listo} />}
      {ajuste && <AtrAjusteModal productos={productos} existencias={existencias} inicial={ajuste} onClose={() => setAjuste(null)} onListo={listo} />}
    </div>
  )
}
