import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { ErrorState, Loading } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canCargarAtr, canEntregarAtr, canOcAtr, canTallerAtr, canVerAtr } from '../utils/permissions'
import { fetchAtrExistencias, fetchAtrProductos } from '../services/atrService'
import { TALLAS_ATR, normalizar } from '../utils/atrCarga'
import { coloresDe, matrizInventario } from '../utils/atrColores'
import AtrBata, { AtrColor } from '../components/atr/AtrBata'
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
  const [fColor, setFColor] = useState('')
  const [fBolsa, setFBolsa] = useState('') // '' | 'con' | 'sin'
  const [soloConExistencia, setSoloConExistencia] = useState(false)
  const [historial, setHistorial] = useState(null) // { producto_id, producto, color, talla, existencia }
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

  // V219 — matriz: una fila por bata (todas las del catálogo, aunque estén en
  // 0) y una columna por talla.
  const { filas, tallas } = useMemo(
    () => (productos && existencias ? matrizInventario(productos, existencias, TALLAS_ATR) : { filas: [], tallas: [] }),
    [productos, existencias],
  )
  const colores = useMemo(() => coloresDe(productos), [productos])
  const vista = useMemo(() => {
    const q = normalizar(busca)
    return filas
      .filter((f) => !fColor || normalizar(f.producto.color) === normalizar(fColor))
      .filter((f) => !fBolsa || (fBolsa === 'con') === !!f.producto.con_bolsa)
      .filter((f) => !soloConExistencia || Object.values(f.porTalla).some((v) => v !== 0))
      .filter((f) => !q || normalizar(`${f.producto.nombre} ${f.producto.color}`).includes(q))
  }, [filas, fColor, fBolsa, soloConExistencia, busca])

  if (error) return <ErrorState error={error} onRetry={cargar} />
  if (!existencias || !productos) return <Loading />

  const totalTalla = (t) => vista.reduce((s, f) => s + (f.porTalla[t] || 0), 0)
  const total = vista.reduce((s, f) => s + f.total, 0)
  const abrir = (f, talla) =>
    setHistorial({ producto_id: f.producto.id, producto: f.producto.nombre, color: f.producto.color, talla, existencia: f.porTalla[talla] || 0 })

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

      <div className="atr-inv-filtros">
        <div className="atr-oc-filtros" role="group" aria-label="Con o sin bolsa">
          {[['', 'Todas'], ['con', '● Con bolsa'], ['sin', '○ Sin bolsa']].map(([k, t]) => (
            <button key={k} type="button" className={'atr-oc-filtro' + (fBolsa === k ? ' is-activo' : '')} onClick={() => setFBolsa(k)}>{t}</button>
          ))}
        </div>
        <div className="atr-inv-colores" role="group" aria-label="Color">
          <button type="button" className={'atr-oc-filtro' + (!fColor ? ' is-activo' : '')} onClick={() => setFColor('')}>Todos los colores</button>
          {colores.map((c) => (
            <button key={c} type="button" className={'atr-inv-color-btn' + (normalizar(fColor) === normalizar(c) ? ' is-activo' : '')}
              onClick={() => setFColor(normalizar(fColor) === normalizar(c) ? '' : c)} aria-pressed={normalizar(fColor) === normalizar(c)}>
              <AtrColor color={c} />
            </button>
          ))}
        </div>
        <div className="atr-acciones">
          <input className="input atr-oc-busca" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <label className="atr-check">
            <input type="checkbox" checked={soloConExistencia} onChange={(e) => setSoloConExistencia(e.target.checked)} /> Solo con existencia
          </label>
        </div>
      </div>

      {existencias.length === 0 && (
        <p className="atr-aviso">
          <span>Todavía no hay inventario cargado: todas las batas están en 0.{canCargarAtr(role) ? <> Empieza con la <Link to="/atr/carga">carga inicial</Link>.</> : null}</span>
        </p>
      )}

      <p className="atr-muted atr-conteo">{vista.length} batas · <strong>{total.toLocaleString('es-MX')}</strong> piezas. Toca un número para ver su historial.</p>
      <div className="atr-tabla-wrap">
        <table className="simple-table atr-tabla atr-matriz">
          <thead>
            <tr>
              <th>Bata</th>
              {tallas.map((t) => <th key={t} className="atr-num atr-matriz__talla">{t}</th>)}
              <th className="atr-num">Total</th>
            </tr>
          </thead>
          <tbody>
            {vista.map((f) => (
              <tr key={f.producto.id}>
                <td className="atr-matriz__bata"><AtrBata producto={f.producto.nombre} color={f.producto.color} conBolsa={!!f.producto.con_bolsa} /></td>
                {tallas.map((t) => {
                  const v = f.porTalla[t] || 0
                  return (
                    <td key={t} className="atr-num atr-matriz__celda">
                      <button type="button" className={'atr-matriz__num' + (v === 0 ? ' is-cero' : v < 0 ? ' atr-negativo' : '')}
                        onClick={() => abrir(f, t)} aria-label={`${f.producto.nombre} ${t}: ${v}`}>
                        {v === 0 ? '·' : v.toLocaleString('es-MX')}
                      </button>
                    </td>
                  )
                })}
                <td className="atr-num"><strong>{f.total.toLocaleString('es-MX')}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              {tallas.map((t) => <td key={t} className="atr-num"><strong>{totalTalla(t).toLocaleString('es-MX')}</strong></td>)}
              <td className="atr-num"><strong>{total.toLocaleString('es-MX')}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

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
