import { useMemo, useState } from 'react'
import {
  calcularStock, revisarArmado, apartadoPorProducto, disponibleBodega, etiquetaEstadoOC, diasParaLimite,
  formatFecha, formatNum, hoyISO, ordenarProductos,
} from '../../utils/frisaConsignacion'
import { crearOT, terminarOT, armarOC, desarmarOC, entregarOC, cancelarOC } from '../../services/frisaConsignacionService'
import FrisaNuevaOC from './FrisaNuevaOC'

// V181 — Órdenes de compra de Frisa: la lista y, al abrir una, sus renglones
// y lo que sigue según su paso (orden de taller → armar → entregar).
const FILTROS = [
  ['pendientes', 'Pendientes'],
  ['recibida', 'Recibidas'],
  ['en_taller', 'En taller'],
  ['lista', 'Listas para armar'],
  ['armada', 'Armadas'],
  ['entregada', 'Entregadas'],
  ['todas', 'Todas'],
]

export function LimiteBadge({ oc }) {
  if (['entregada', 'cancelada'].includes(oc.estado) || !oc.fecha_limite) return null
  const d = diasParaLimite(oc)
  const cls = d < 0 ? 'frisa-nivel--rojo' : d <= 3 ? 'frisa-nivel--amarillo' : 'frisa-nivel--neutro'
  const txt = d < 0 ? `Vencida hace ${-d} día${d === -1 ? '' : 's'}` : d === 0 ? 'Vence hoy' : `Vence en ${d} día${d === 1 ? '' : 's'}`
  return <span className={'frisa-nivel ' + cls}>{txt}</span>
}

export default function FrisaOrdenesCompra({ datos, recargar }) {
  const [filtro, setFiltro] = useState('pendientes')
  const [abierta, setAbierta] = useState(null)
  const [nueva, setNueva] = useState(false)
  const planta = useMemo(() => Object.fromEntries(datos.plantas.map((p) => [p.id, p])), [datos])
  const piezas = useMemo(() => {
    const m = {}
    for (const l of datos.ocLineas) m[l.oc_id] = (m[l.oc_id] || 0) + l.cantidad
    return m
  }, [datos])

  const lista = datos.ordenes
    .filter((o) => (filtro === 'todas' ? true : filtro === 'pendientes' ? !['entregada', 'cancelada'].includes(o.estado) : o.estado === filtro))
    .sort((a, b) => {
      const abiertaA = !['entregada', 'cancelada'].includes(a.estado), abiertaB = !['entregada', 'cancelada'].includes(b.estado)
      if (abiertaA !== abiertaB) return abiertaA ? -1 : 1
      if (abiertaA) return (a.fecha_limite || '9999') < (b.fecha_limite || '9999') ? -1 : 1
      return (a.entregada_fecha || a.creado_en) < (b.entregada_fecha || b.creado_en) ? 1 : -1
    })
  const cuenta = (k) => datos.ordenes.filter((o) => (k === 'pendientes' ? !['entregada', 'cancelada'].includes(o.estado) : o.estado === k)).length

  if (nueva) return <FrisaNuevaOC datos={datos} onCancelar={() => setNueva(false)} onGuardada={(id) => { setNueva(false); setFiltro('pendientes'); setAbierta(id); recargar() }} />

  return (
    <div>
      <div className="frisa__barra">
        <p className="frisa__nota">
          Cada orden de compra (OC) es de una planta y se entrega completa: <strong>orden de taller → armar → entregar</strong> con el
          folio de la remisión de Microsip.
        </p>
        <button type="button" className="btn btn--primary btn--small" onClick={() => setNueva(true)}>+ Subir orden de compra</button>
      </div>
      <div className="order-filters__chips frisa__chips">
        {FILTROS.map(([k, label]) => (
          <button key={k} type="button" className={'chip' + (filtro === k ? ' chip--active' : '')} onClick={() => setFiltro(k)}>
            {label}{k !== 'todas' && <span className="frisa__sub"> {cuenta(k)}</span>}
          </button>
        ))}
      </div>

      {lista.length === 0 ? <p className="frisa__sub">No hay órdenes de compra aquí.</p> : (
        <div className="frisa-oc-lista">
          {lista.map((o) => (
            <div key={o.id} className={'card frisa-oc' + (abierta === o.id ? ' frisa-oc--abierta' : '')}>
              <button type="button" className="frisa-oc__cabeza" onClick={() => setAbierta(abierta === o.id ? null : o.id)} aria-expanded={abierta === o.id}>
                <span className="frisa-oc__num">OC {o.numero}</span>
                <span className="frisa-oc__planta">{planta[o.planta_id]?.nombre}</span>
                <span className={'frisa-estado frisa-estado--' + o.estado}>{etiquetaEstadoOC(o.estado)}</span>
                <LimiteBadge oc={o} />
                <span className="frisa__sub frisa-oc__meta">
                  {formatNum(piezas[o.id] || 0)} pzas{o.fecha_limite ? ` · límite ${formatFecha(o.fecha_limite)}` : ''}
                  {o.remision_folio ? ` · Rem. ${o.remision_folio} (${formatFecha(o.entregada_fecha)})` : ''}
                </span>
              </button>
              {abierta === o.id && <DetalleOC oc={o} datos={datos} recargar={recargar} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DetalleOC({ oc, datos, recargar }) {
  const prod = useMemo(() => Object.fromEntries(datos.productos.map((p) => [p.id, p])), [datos])
  const lineas = useMemo(() => {
    const ls = datos.ocLineas.filter((l) => l.oc_id === oc.id)
    const orden = ordenarProductos(ls.map((l) => prod[l.producto_id]).filter(Boolean)).map((p) => p.id)
    return ls.sort((a, b) => orden.indexOf(a.producto_id) - orden.indexOf(b.producto_id))
  }, [datos, oc.id, prod])
  const stock = useMemo(() => calcularStock(datos.movimientos), [datos])
  const revision = revisarArmado(oc, lineas, stock, datos.ordenes, datos.ocLineas)
  const talleres = datos.talleres.filter((t) => t.oc_id === oc.id)
  const otAbierta = talleres.find((t) => t.estado === 'abierta')
  const [panel, setPanel] = useState(null)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const cerrada = ['entregada', 'cancelada'].includes(oc.estado)

  async function hacer(fn, ok) {
    setGuardando(true)
    setError(null)
    const { error: e } = await fn()
    setGuardando(false)
    if (e) return setError(e.message)
    setPanel(null)
    ok?.()
    recargar()
  }

  return (
    <div className="frisa-oc__detalle">
      <div className="revision__tabla-wrap">
        <table className="simple-table frisa-tabla">
          <thead>
            <tr>
              <th>SKU</th><th>Descripción en la OC</th><th className="num">Pide</th>
              {!cerrada && <><th className="num">Disponible en bodega</th><th className="num">Falta</th></>}
            </tr>
          </thead>
          <tbody>
            {revision.filas.map((l) => (
              <tr key={l.id} className={!cerrada && l.falta ? 'frisa-fila--rojo' : ''}>
                <td><strong>{prod[l.producto_id]?.sku}</strong><div className="frisa__sub">{prod[l.producto_id]?.nombre}</div></td>
                <td className="frisa__sub">{l.descripcion_original || '—'}</td>
                <td className="num"><strong>{formatNum(l.cantidad)}</strong></td>
                {!cerrada && <><td className="num">{formatNum(l.disponible)}</td><td className="num">{l.falta ? <span className="frisa__falta">{formatNum(l.falta)}</span> : '✓'}</td></>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {talleres.length > 0 && (
        <p className="frisa__sub">
          Órdenes de taller: {talleres.map((t) => `${t.folio} (${t.estado}${t.terminada_fecha ? ' ' + formatFecha(t.terminada_fecha) : ''})`).join(', ')}
        </p>
      )}
      {oc.estado === 'cancelada' && <p className="frisa__sub">Cancelada: {oc.cancelada_motivo}</p>}
      {oc.creado_por_nombre && <p className="frisa__sub">Capturó: {oc.creado_por_nombre}{oc.fecha_oc ? ` · fecha de la OC ${formatFecha(oc.fecha_oc)}` : ''}</p>}

      {!cerrada && (
        <div className="frisa__botones frisa-oc__acciones">
          {['recibida', 'lista'].includes(oc.estado) && !otAbierta && (
            <button type="button" className="btn btn--primary btn--small" onClick={() => setPanel('ot')}>Hacer orden de taller</button>
          )}
          {otAbierta && (
            <button type="button" className="btn btn--primary btn--small" onClick={() => setPanel('terminar')}>Terminar {otAbierta.folio}</button>
          )}
          {oc.estado !== 'armada' && (
            <button type="button" className={'btn btn--small ' + (revision.completa ? 'btn--primary' : 'btn--secondary')} disabled={guardando || !revision.completa}
              title={revision.completa ? '' : 'La bodega no tiene todo: no se aceptan parciales'}
              onClick={() => hacer(() => armarOC(oc.id))}>
              Armar orden {revision.completa ? '' : '(falta producto)'}
            </button>
          )}
          {oc.estado === 'armada' && (
            <>
              <button type="button" className="btn btn--primary btn--small" onClick={() => setPanel('entregar')}>Entregar</button>
              <button type="button" className="btn btn--ghost btn--small" disabled={guardando} onClick={() => hacer(() => desarmarOC(oc.id))}>Desarmar</button>
            </>
          )}
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setPanel('cancelar')}>Cancelar OC</button>
        </div>
      )}
      {oc.estado === 'armada' && <p className="frisa__ok">Armada: las piezas están apartadas para esta orden.</p>}

      {panel === 'ot' && <PanelOT oc={oc} lineas={lineas} stock={stock} datos={datos} prod={prod} guardando={guardando}
        onCancelar={() => setPanel(null)} onGuardar={(args) => hacer(() => crearOT(args))} />}
      {panel === 'terminar' && <PanelFecha titulo={`Terminar ${otAbierta.folio}: lo producido entra a la bodega SALPER`} boton="Terminar orden de taller"
        guardando={guardando} onCancelar={() => setPanel(null)} onGuardar={({ fecha }) => hacer(() => terminarOT(otAbierta.id, fecha))} />}
      {panel === 'entregar' && <PanelFecha titulo="Entregar a la planta" boton="Registrar entrega" conRemision guardando={guardando}
        onCancelar={() => setPanel(null)} onGuardar={({ fecha, remision }) => hacer(() => entregarOC(oc.id, fecha, remision))} />}
      {panel === 'cancelar' && <PanelCancelar guardando={guardando} onCancelar={() => setPanel(null)} onGuardar={(motivo) => hacer(() => cancelarOC(oc.id, motivo))} />}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

// Orden de taller: por omisión TODO lo de la OC (opción a). Con "Tomar lo
// que haya en bodega" solo se produce lo que falta (para cuando haya inventario).
function PanelOT({ oc, lineas, stock, datos, prod, guardando, onCancelar, onGuardar }) {
  const apartado = apartadoPorProducto(datos.ordenes, datos.ocLineas, oc.id)
  const [deBodega, setDeBodega] = useState(false)
  const propuesta = (usar) => Object.fromEntries(lineas.map((l) => [l.producto_id,
    String(usar ? Math.max(0, l.cantidad - Math.max(0, disponibleBodega(stock, apartado, l.producto_id))) : l.cantidad)]))
  const [cant, setCant] = useState(() => propuesta(false))
  const [fecha, setFecha] = useState(oc.fecha_limite || '')
  const total = Object.values(cant).reduce((s, n) => s + (Number(n) || 0), 0)
  return (
    <div className="card frisa-panel">
      <h4 className="section-title section-title--small">Nueva orden de taller · OC {oc.numero}</h4>
      <label className="frisa-check">
        <input type="checkbox" checked={deBodega} onChange={(e) => { setDeBodega(e.target.checked); setCant(propuesta(e.target.checked)) }} />
        Tomar lo que haya en bodega (producir solo lo que falta)
      </label>
      <div className="revision__tabla-wrap">
        <table className="simple-table frisa-tabla">
          <thead><tr><th>SKU</th><th className="num">Pide la OC</th><th className="num">A producir</th></tr></thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.id}>
                <td><strong>{prod[l.producto_id]?.sku}</strong></td>
                <td className="num">{formatNum(l.cantidad)}</td>
                <td className="num">
                  <input className="input frisa-input" inputMode="numeric" value={cant[l.producto_id]} aria-label={`Producir ${prod[l.producto_id]?.sku}`}
                    onChange={(e) => setCant((c) => ({ ...c, [l.producto_id]: e.target.value.replace(/[^0-9]/g, '') }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="frisa-form__fila">
        <label><span className="field-label">Fecha compromiso</span><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
      </div>
      <div className="frisa__botones">
        <button type="button" className="btn btn--primary btn--small" disabled={guardando || total === 0}
          onClick={() => onGuardar({ ocId: oc.id, fechaCompromiso: fecha, lineas: Object.entries(cant).map(([producto_id, n]) => ({ producto_id, cantidad: Number(n) || 0 })) })}>
          Crear orden de taller ({formatNum(total)} pzas)
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancelar}>Cancelar</button>
      </div>
      {total === 0 && <p className="frisa__sub">No hay nada que producir: si la bodega ya tiene todo, usa «Armar orden».</p>}
    </div>
  )
}

export function PanelFecha({ titulo, boton, conRemision, guardando, onCancelar, onGuardar }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [remision, setRemision] = useState('')
  return (
    <div className="card frisa-panel">
      <h4 className="section-title section-title--small">{titulo}</h4>
      <div className="frisa-form__fila">
        <label><span className="field-label">Fecha</span><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        {conRemision && (
          <label><span className="field-label">Folio de la remisión (Microsip)</span>
            <input className="input" value={remision} placeholder="Ej. 812" onChange={(e) => setRemision(e.target.value)} /></label>
        )}
      </div>
      <div className="frisa__botones">
        <button type="button" className="btn btn--primary btn--small" disabled={guardando || !fecha || (conRemision && !remision.trim())} onClick={() => onGuardar({ fecha, remision })}>{boton}</button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

function PanelCancelar({ guardando, onCancelar, onGuardar }) {
  const [motivo, setMotivo] = useState('')
  return (
    <div className="card frisa-panel">
      <h4 className="section-title section-title--small">Cancelar la orden de compra</h4>
      <label className="frisa-form__ancho"><span className="field-label">Motivo</span>
        <input className="input" value={motivo} placeholder="Ej. Frisa la canceló por correo" onChange={(e) => setMotivo(e.target.value)} /></label>
      <div className="frisa__botones">
        <button type="button" className="btn btn--primary btn--small" disabled={guardando || !motivo.trim()} onClick={() => onGuardar(motivo)}>Cancelar OC</button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancelar}>Regresar</button>
      </div>
    </div>
  )
}
