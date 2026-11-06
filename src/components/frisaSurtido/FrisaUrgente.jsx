import { useState } from 'react'
import { piezasDe, textoLimite } from '../../utils/frisaSurtido'
import FrisaSurtidoDetalle from './FrisaSurtidoDetalle'
import { NombreFrisa } from '../frisaNiveles/comunes'

const num = (n) => Number(n || 0).toLocaleString('es-MX')

// V185 — Urgente: disponible − órdenes por surtir. Por fecha límite, cada
// orden se surte completa o no se surte.
export default function FrisaUrgente({ datos, inv, urgente, permisos, recargar }) {
  const [abierta, setAbierta] = useState(null)
  const [aviso, setAviso] = useState(null)
  const { ordenes, porClave, completas, piezasFaltantes } = urgente
  const faltan = porClave.filter((c) => c.falta > 0)
  const abiertaO = abierta ? ordenes.find((o) => o.surtido.id === abierta) : null

  return (
    <div className="page frisa frisa-surtido">
      <div className="frisa__encabezado">
        <div>
          <h1 className="page-title">Frisa · urgente</h1>
          <p className="page-subtitle">
            Inventario disponible contra las órdenes por surtir, de la fecha límite más próxima a la más lejana. Frisa no acepta
            parciales: una orden solo cuenta como lista si alcanza para toda.
          </p>
        </div>
      </div>
      {aviso && <p className="frisa__ok">{aviso}</p>}

      <div className="stats-grid frisa-niveles__resumen">
        <div className="stat-card"><span className="stat-card__label">Por surtir</span><span className="stat-card__value">{ordenes.length}</span><span className="stat-card__hint">órdenes pendientes</span></div>
        <div className="stat-card frisa-niveles__tarjeta--ok"><span className="stat-card__label">Se pueden surtir</span><span className="stat-card__value">{completas}</span><span className="stat-card__hint">completas, hoy</span></div>
        <div className="stat-card frisa-niveles__tarjeta--critico"><span className="stat-card__label">Esperando inventario</span><span className="stat-card__value">{ordenes.length - completas}</span><span className="stat-card__hint">les falta algo</span></div>
        <div className="stat-card"><span className="stat-card__label">Piezas que faltan</span><span className="stat-card__value">{num(piezasFaltantes)}</span><span className="stat-card__hint">{faltan.length} clave{faltan.length === 1 ? "" : "s"}</span></div>
      </div>

      {!ordenes.length && <div className="card frisa__vacio"><p>No hay órdenes pendientes de surtir.</p></div>}

      {ordenes.length > 0 && (
        <>
          <h2 className="section-title section-title--small">Órdenes por surtir</h2>
          <div className="frisa-oc-lista">
            {ordenes.map((o) => {
              const lim = textoLimite(o.surtido.fecha_limite)
              return (
                <button key={o.surtido.id} type="button" className={'card frisa-surtido__tarjeta ' + (o.completa ? 'frisa-surtido__tarjeta--ok' : 'frisa-surtido__tarjeta--falta')}
                  onClick={() => setAbierta(o.surtido.id)}>
                  <span className="frisa-surtido__fila1">
                    <span className="frisa-oc__num">OC {o.surtido.numero_oc}</span>
                    {o.completa
                      ? <span className="frisa-nivel frisa-nivel--verde">Se puede surtir completa</span>
                      : <span className="frisa-nivel frisa-nivel--rojo">Falta inventario</span>}
                  </span>
                  <span className="frisa-oc__planta">{o.surtido.planta}</span>
                  <span className="frisa__sub">{num(piezasDe(o.lineas))} pzas · <span className={lim.urgente ? 'frisa__falta' : ''}>{lim.texto}</span></span>
                  {!o.completa && (
                    <span className="frisa__falta">Falta: {o.faltantes.map((f) => `${f.clave} (${num(f.falta)})`).join(', ')}</span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}

      {faltan.length > 0 && (
        <>
          <h2 className="section-title section-title--small">Lo que falta por clave (todas las órdenes pendientes)</h2>
          <div className="revision__tabla-wrap">
            <table className="simple-table frisa-tabla">
              <thead><tr><th>Clave</th><th className="num">Piden</th><th className="num">Disponible</th><th className="num">Falta</th></tr></thead>
              <tbody>
                {faltan.map((c) => (
                  <tr key={c.producto.id}>
                    <td><strong>{c.producto.clave}</strong><NombreFrisa producto={c.producto} /></td>
                    <td className="num">{num(c.pendiente)}</td>
                    <td className="num">{num(c.disponible)}</td>
                    <td className="num"><strong className="frisa__falta">{num(c.falta)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {abiertaO && (
        <FrisaSurtidoDetalle surtido={abiertaO.surtido} lineas={abiertaO.lineas} inv={inv} permisos={permisos}
          productos={datos.productos} alias={datos.alias}
          onClose={() => setAbierta(null)} onCambio={async (msg) => { setAviso(msg); setAbierta(null); await recargar() }} />
      )}
    </div>
  )
}
