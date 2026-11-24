import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import StatusBadge from '../orders/StatusBadge'
import { fetchOrdenesFrisaParaBuscar } from '../../services/frisaService'
import { coincideFolioFrisa } from '../../utils/folioExterno'
import { nombreFrisa } from '../../utils/frisaColores'

// V218 — buscar una orden de taller de Frisa por su folio FR o por su folio
// externo (folio de nuestro control interno). Incluye las que no están en el
// restock; no incluye las eliminadas.
const piezas = (o) => (Array.isArray(o.items) ? o.items : [])
  .reduce((t, it) => t + (Array.isArray(it?.sizes) ? it.sizes : []).reduce((a, s) => a + (Number(s?.cantidad) || 0), 0), 0)

export default function BuscarOrdenesFrisa() {
  const [texto, setTexto] = useState('')
  const [ordenes, setOrdenes] = useState(null)
  const [error, setError] = useState(null)
  const q = texto.trim()

  useEffect(() => {
    if (!q || ordenes) return
    let vivo = true
    fetchOrdenesFrisaParaBuscar().then(({ data, error: e }) => {
      if (!vivo) return
      if (e) setError(e)
      else setOrdenes(data || [])
    })
    return () => { vivo = false }
  }, [q, ordenes])

  const encontradas = q && ordenes ? ordenes.filter((o) => coincideFolioFrisa(o, q)).slice(0, 30) : []

  return (
    <section className="frisa-restock__seccion frisa-buscar-ot">
      <label className="frisa-buscar-ot__campo">
        <span className="field-label">Buscar orden de taller</span>
        <input className="input" type="search" value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Folio FR o folio externo (ej. FR-025, ORD3310)" />
      </label>
      {error && <p className="form-error">No se pudo buscar: {error.message}</p>}
      {q && ordenes && !encontradas.length && <p className="frisa__sub">No hay órdenes de Frisa con «{q}».</p>}
      {encontradas.length > 0 && (
        <div className="frisa-oc-lista">
          {encontradas.map((o) => (
            <Link key={o.id} to={`/orden/${o.id}`} className="card frisa-surtido__tarjeta frisa-restock__orden frisa-buscar-ot__res">
              <span className="frisa-surtido__fila1">
                <span className="frisa-oc__num">{o.order_number}</span>
                {o.cancelled_at ? <span className="badge badge--danger">Cancelada</span> : <StatusBadge status={o.status} />}
              </span>
              <span className="frisa-oc__planta">{nombreFrisa(o.frisa_producto?.nombre) || o.frisa_producto?.codigo || 'Producto Frisa'}</span>
              <span className="frisa__sub">
                {o.folio_externo ? <>Folio externo: <strong>{o.folio_externo}</strong> · </> : 'Sin folio externo · '}
                {piezas(o).toLocaleString('es-MX')} pzas
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
