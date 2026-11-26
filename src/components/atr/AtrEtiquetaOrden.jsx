import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAtrEstadoOrden, fetchAtrPorSubir, fetchAtrSubidaOrden } from '../../services/atrService'
import { canSubirAtr } from '../../utils/permissions'
import { formatDateTime } from '../../utils/dates'
import AtrSubirModal from './AtrSubirModal'
import './atr.css'

// V211 — En una orden de ATR dice si ya entró al inventario. V224: como en
// Frisa, al completar Terminado la orden queda "Por subir" y entra al
// inventario cuando alguien toca "Subir a bodega" (aquí mismo o en Surtido
// ATR → Por subir). Avisa si hay prendas que no vienen del catálogo de ATR
// (esas no se suman). En órdenes de otros clientes no pinta nada.
export default function AtrEtiquetaOrden({ order }) {
  const { role } = useAuth()
  const [estado, setEstado] = useState(null)
  const [subida, setSubida] = useState(null)
  const [modal, setModal] = useState(null)
  const [error, setError] = useState(null)
  const firma = `${order.id}|${order.status}|${order.eliminada_en || ''}|${JSON.stringify(order.items || [])}`

  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([fetchAtrEstadoOrden(order.id), fetchAtrSubidaOrden(order.id)])
    setEstado(a.data)
    setSubida(b.error ? null : b.data)
  }, [order.id])

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma])

  async function abrirSubir() {
    setError(null)
    const { data, error: e } = await fetchAtrPorSubir()
    if (e) return setError(e.message)
    const fila = (data || []).find((f) => f.order_id === order.id)
    if (!fila) return setError('Esta orden ya no está por subir. Recarga la página.')
    setModal(fila)
  }

  if (!estado?.es_atr) return null
  return (
    <div className="atr-etiqueta">
      {subida?.subida ? (
        <span className="atr-etiqueta__ok" title={subida.subido_en ? `${subida.usuario_nombre || ''} · ${formatDateTime(subida.subido_en)}` : undefined}>
          Subido a bodega ✓ · {subida.piezas} {subida.piezas === 1 ? 'bata' : 'batas'} en el inventario ATR
        </span>
      ) : subida?.terminado ? (
        <div className="atr-etiqueta__fila">
          <span className="atr-etiqueta__pendiente">Falta subir a bodega</span>
          {canSubirAtr(role) ? (
            <button type="button" className="btn btn--primary btn--small" onClick={abrirSubir}>Subir a bodega</button>
          ) : (
            <Link to="/atr?tab=subir">Surtido ATR → Por subir</Link>
          )}
        </div>
      ) : subida ? (
        <span className="atr-muted">Inventario ATR: al completar Terminado, súbela a bodega para que entre al inventario.</span>
      ) : estado.sumado ? (
        <span className="atr-etiqueta__ok" title={estado.sumado_en ? `Desde ${formatDateTime(estado.sumado_en)}` : undefined}>
          Sumado al inventario ATR ✓ · {estado.piezas} {estado.piezas === 1 ? 'bata' : 'batas'}
        </span>
      ) : (
        <span className="atr-muted">Inventario ATR: se suma lo surtido al completar Terminado.</span>
      )}
      {error && <span className="atr-etiqueta__aviso">{error}</span>}
      {estado.prendas_sin_ligar > 0 && (
        <span className="atr-etiqueta__aviso">
          {estado.prendas_sin_ligar === 1 ? '1 prenda no viene' : `${estado.prendas_sin_ligar} prendas no vienen`} del catálogo de ATR y no se suma
          {estado.prendas_sin_ligar === 1 ? '' : 'n'} al inventario.
        </span>
      )}
      {modal && (
        <AtrSubirModal
          orden={modal}
          onClose={() => setModal(null)}
          onListo={() => { setModal(null); cargar() }}
        />
      )}
    </div>
  )
}
