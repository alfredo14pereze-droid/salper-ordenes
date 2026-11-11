import { nombreFrisa } from '../../utils/frisaColores'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Loading, ErrorState } from '../common/States'
import Modal from '../talleros/Modal'
import { canCrearOrdenesRestock, canSubirBodegaFrisa, canComprasFrisa, canVerTodoFrisa, canRecibirPantalonFrisa, canRecibirLisaFrisa } from '../../utils/permissions'
import {
  fetchRestockTodo, buscarOrdenPorFolio, ligarOrden, desligarOrden, subirABodega, crearCompra, recibirCompra, cancelarCompra,
} from '../../services/frisaRestockService'
import { createOrderFrisa } from '../../services/frisaService'
import { conInventario } from '../../utils/frisaSurtido'
import { CONFIG_INICIAL, calcularNiveles } from '../../utils/frisaNiveles'
import { calcularRestock, itemsOrdenRestock, propuestaIngreso } from '../../utils/frisaRestock'
import { calcularLisas, nombreLisa } from '../../utils/frisaLisas'
import FrisaLisas from './FrisaLisas'
import { EstadoBadge, NombreFrisa, fechaCorta } from '../frisaNiveles/comunes'
import { prendaYTalla } from '../../utils/frisaPlantas'

const num = (n) => Number(n || 0).toLocaleString('es-MX')
const masDias = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const ESTADO_OT = {
  en_proceso: ['En proceso', 'neutro'], por_entrar: ['Por entrar (terminada)', 'naranja'],
  en_bodega: ['En bodega', 'verde'], cancelada: ['Cancelada', 'neutro'],
}

// V186 — Restock: qué pedir (órdenes de taller FR o pedido de compra), lo
// que está en proceso / por entrar, subir a bodega y recibir compras.
export default function FrisaRestock() {
  const { role } = useAuth()
  const puede = { ordenes: canCrearOrdenesRestock(role), bodega: canSubirBodegaFrisa(role), compras: canComprasFrisa(role),
    recibirPantalon: canRecibirPantalonFrisa(role), recibirLisa: canRecibirLisaFrisa(role) }
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState(null)
  const [todas, setTodas] = useState(false)
  const [otroTaller, setOtroTaller] = useState('') // producto Frisa para una orden de taller que no se propuso
  const [sub, setSub] = useState('taller') // 'taller' | 'pantalon' | 'lisa'
  const [ingresar, setIngresar] = useState(null) // fila de orden
  const [recibir, setRecibir] = useState(null) // compra

  const recargar = useCallback(async () => {
    const { data, error: e } = await fetchRestockTodo()
    if (e) setError(e)
    else { setError(null); setDatos(data) }
    setCargando(false)
  }, [])
  useEffect(() => { recargar() }, [recargar])

  const r = useMemo(() => {
    if (!datos) return null
    const productosInv = conInventario(datos.productos, datos.surtidos, datos.lineas)
    const res = calcularRestock({ ...datos, productosInv, cfg: datos.config || CONFIG_INICIAL })
    return { ...res, lisas: calcularLisas({ ...datos, talleresPropuestos: res.talleresPropuestos }) }
  }, [datos])

  if (cargando) return <Loading />
  if (error) return <div className="page"><ErrorState error={error} onRetry={recargar} /></div>

  const pfPorId = new Map(datos.productosFrisa.map((p) => [p.id, p]))
  const listo = async (msg) => { setAviso(msg); await recargar() }
  const ORDEN = { critico: 0, pedir: 1, ok: 2 }
  const visibles = r.filas.filter((f) => todas || f.aPedir > 0 || f.enProceso > 0 || f.porEntrar > 0)
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || b.aPedir - a.aPedir || a.producto.clave.localeCompare(b.producto.clave))
  // 2026-11-07: cada quien ve lo suyo. Planea = crea órdenes de taller o pedidos (Gis);
  // bodega = confirma subidas a bodega y recibe compras.
  const verTodo = canVerTodoFrisa(role)
  const planea = puede.ordenes || puede.compras || verTodo
  const porEntrar = r.ordenes.filter((o) => o.estado === 'por_entrar')
  const enProceso = r.ordenes.filter((o) => o.estado === 'en_proceso')
  const conLisa = new Set(datos.compraLineasLisa.map((l) => l.compra_id))
  const comprasLisa = datos.compras.filter((c) => conLisa.has(c.id))
  const comprasNormales = datos.compras.filter((c) => !conLisa.has(c.id))

  return (
    <div className="page frisa frisa-surtido">
      <div className="frisa__encabezado">
        <div>
          <h1 className="page-title">Frisa · restock</h1>
          <p className="page-subtitle">
            Para cada clave: disponible + en proceso + por entrar = proyectado. Si el proyectado llega al reorden, se pide lo que falta
            para el máximo: lo que se fabrica como orden de taller (FR) y lo que se compra hecho como pedido de compra.
          </p>
        </div>
      </div>
      {aviso && <p className="frisa__ok">{aviso}</p>}

      <div className="notas-pestanas frisa__secciones" role="tablist" aria-label="Restock">
        {[['taller', 'Órdenes de taller', r.talleresPropuestos.length + porEntrar.length],
          ['pantalon', 'Pantalón', r.compraPropuesta.length + comprasNormales.filter((c) => c.estado === 'pedida').length],
          ['lisa', 'Playera lisa', r.lisas.filas.filter((f) => f.aComprar > 0).length + comprasLisa.filter((c) => c.estado === 'pedida').length]].map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={sub === k} className={'notas-pestana' + (sub === k ? ' notas-pestana--activa' : '')} onClick={() => setSub(k)}>
            {label}{n ? ` (${n})` : ''}
          </button>
        ))}
      </div>

      {sub === 'taller' && (
        <>
          {planea && <div className="stats-grid frisa-niveles__resumen">
            <div className="stat-card"><span className="stat-card__label">Por pedir al taller</span><span className="stat-card__value">{num(r.talleresPropuestos.reduce((t, g) => t + g.lineas.reduce((a, l) => a + l.cantidad, 0), 0))}</span><span className="stat-card__hint">{r.talleresPropuestos.length} órdenes FR</span></div>
            <div className="stat-card"><span className="stat-card__label">En proceso</span><span className="stat-card__value">{enProceso.length}</span><span className="stat-card__hint">órdenes de taller</span></div>
            <div className="stat-card frisa-niveles__tarjeta--pedir"><span className="stat-card__label">Por entrar</span><span className="stat-card__value">{porEntrar.length}</span><span className="stat-card__hint">terminadas, sin subir a bodega</span></div>
          </div>}
          {(puede.bodega || verTodo) && porEntrar.length > 0 && (
            <section className="frisa-restock__seccion">
              <h2 className="section-title section-title--small">Por entrar: terminadas, falta subirlas a bodega</h2>
              <ListaOrdenes filas={porEntrar} pfPorId={pfPorId} puede={puede} onSubir={setIngresar} onListo={listo} />
            </section>
          )}
          {planea && <section className="frisa-restock__seccion">
            <div className="frisa__barra">
              <h2 className="section-title section-title--small">Por pedir al taller</h2>
              <label className="frisa-niveles__toggle"><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Ver todas las claves</label>
            </div>
            <TablaRestock filas={visibles.filter((f) => f.se === 'fabrica')} />
          </section>}
          {planea && r.talleresPropuestos.map((g) => (
            <PropuestaTaller key={g.producto_frisa_id} grupo={g} productoFrisa={pfPorId.get(g.producto_frisa_id)} puede={puede.ordenes} onListo={listo} />
          ))}
          {planea && puede.ordenes && (() => {
            const otros = r.talleresTodos.filter((g) => !r.talleresPropuestos.some((x) => x.producto_frisa_id === g.producto_frisa_id))
            const g = otros.find((x) => x.producto_frisa_id === otroTaller)
            return otros.length > 0 && (
              <>
                {g && <PropuestaTaller key={'otro-' + g.producto_frisa_id} grupo={{ ...g, lineas: g.lineas.map((l) => ({ ...l, cantidad: 0 })) }}
                  productoFrisa={pfPorId.get(g.producto_frisa_id)} puede={puede.ordenes} onListo={(m) => { setOtroTaller(''); listo(m) }} onCerrar={() => setOtroTaller('')} />}
                <label className="frisa-restock__otro">
                  <span className="field-label">Orden de taller de otro producto</span>
                  <select className="input" value={otroTaller} onChange={(e) => setOtroTaller(e.target.value)}>
                    <option value="">Elige el producto…</option>
                    {otros.map((x) => <option key={x.producto_frisa_id} value={x.producto_frisa_id}>{nombreFrisa(pfPorId.get(x.producto_frisa_id)?.nombre) || 'Producto'}</option>)}
                  </select>
                </label>
              </>
            )
          })()}
          {planea && <section className="frisa-restock__seccion">
            <h2 className="section-title section-title--small">Órdenes de taller en proceso</h2>
            {!enProceso.length && <p className="frisa__sub">Ninguna.</p>}
            <ListaOrdenes filas={enProceso} pfPorId={pfPorId} puede={puede} onListo={listo} />
            {puede.ordenes && <LigarExistente onListo={listo} />}
          </section>}
        </>
      )}

      {sub === 'pantalon' && (
        <>
          {comprasNormales.some((c) => c.estado === 'pedida') && (
            <ListaCompras titulo="Por recibir: pedidos de pantalón que no han llegado" destacada compras={comprasNormales.filter((c) => c.estado === 'pedida')} datos={datos} puede={puede} puedeRecibir={puede.recibirPantalon} onRecibir={setRecibir} onListo={listo} />
          )}
          <AvisoReorden titulo="Aviso de reorden: pantalón, bata y bolsa" filas={r.filas.filter((f) => f.se !== 'fabrica')} cfg={datos.config || CONFIG_INICIAL} />
          {planea && <section className="frisa-restock__seccion">
            <div className="frisa__barra">
              <h2 className="section-title section-title--small">Por comprar (pantalón, bata, bolsa)</h2>
              <label className="frisa-niveles__toggle"><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Ver todas las claves</label>
            </div>
            <TablaRestock filas={visibles.filter((f) => f.se !== 'fabrica')} />
          </section>}
          {planea && <PropuestaCompra key={r.compraPropuesta.map((l) => l.producto_id + ':' + l.cantidad).join(',')} filas={r.filas.filter((f) => f.se !== 'fabrica')} puede={puede.compras} onListo={listo} />}
          {planea && <ListaCompras titulo="Pedidos de pantalón anteriores (recibidos o cancelados)" compras={comprasNormales.filter((c) => c.estado !== 'pedida')} datos={datos} puede={puede} onRecibir={setRecibir} onListo={listo} />}
        </>
      )}

      {sub === 'lisa' && (
        <>
          {comprasLisa.some((c) => c.estado === 'pedida') && (
            <ListaCompras titulo="Por recibir: pedidos de playera lisa que no han llegado" destacada compras={comprasLisa.filter((c) => c.estado === 'pedida')} datos={datos} puede={puede} puedeRecibir={puede.recibirLisa} onRecibir={setRecibir} onListo={listo} />
          )}
          <AvisoReorden titulo="Aviso de reorden: playeras terminadas" filas={r.filas.filter((f) => f.se === 'fabrica' && /^PLAYERA/i.test(String(f.producto.nombre || '').trim()))} cfg={datos.config || CONFIG_INICIAL} />
          <FrisaLisas calculo={r.lisas} puede={puede} onListo={listo} />
          {planea && <ListaCompras titulo="Pedidos de playera lisa anteriores (recibidos o cancelados)" compras={comprasLisa.filter((c) => c.estado !== 'pedida')} datos={datos} puede={puede} onRecibir={setRecibir} onListo={listo} />}
        </>
      )}


      {ingresar && (
        <ModalIngreso fila={ingresar} datos={datos} pfPorId={pfPorId} onClose={() => setIngresar(null)}
          onListo={(m) => { setIngresar(null); listo(m) }} />
      )}
      {recibir && (
        <ModalRecibir compra={recibir}
          lineas={[
            ...datos.compraLineas.filter((l) => l.compra_id === recibir.id).map((l) => {
              const { prenda, talla } = prendaYTalla(datos.productos.find((x) => x.id === l.producto_id)?.nombre || l.clave)
              return { ...l, key: l.producto_id, clave: `${prenda.charAt(0)}${prenda.slice(1).toLowerCase()} · talla ${talla}` }
            }),
            ...datos.compraLineasLisa.filter((l) => l.compra_id === recibir.id).map((l) => {
              const li = datos.lisas.find((x) => x.id === l.lisa_id)
              return { ...l, key: l.lisa_id, clave: li ? nombreLisa(li) : 'Playera lisa' }
            }),
          ]}
          onClose={() => setRecibir(null)}
          onListo={(m) => { setRecibir(null); listo(m) }} />
      )}
    </div>
  )
}

// 2026-11-11 — Aviso de reorden (como en Niveles de inventario), con dos estados:
//   Hoy              = con el disponible de hoy (igual que Niveles).
//   Con lo que viene = disponible + en camino (órdenes de taller y pedidos sin llegar).
// CERCA = hasta 20% arriba del punto de reorden: para el siguiente pedido ya va a hacer falta.
// Sale si cualquiera de los dos no está OK.
const ORDEN_AVISO = { critico: 0, pedir: 1, cerca: 2, ok: 3 }
const estadoAviso = (stock, n) => (stock <= n.minimo ? 'critico' : stock <= n.reorden ? 'pedir' : stock <= Math.ceil(n.reorden * 1.2) ? 'cerca' : 'ok')
function BadgeAviso({ estado }) {
  if (estado === 'cerca') return <span className="frisa-nivel frisa-nivel--amarillo">CERCA</span>
  return <EstadoBadge estado={estado} />
}
function AvisoReorden({ titulo, filas, cfg }) {
  const lista = filas.map((f) => {
    const n = calcularNiveles(f.producto, cfg)
    const disp = Number(f.producto.disponible) || 0
    const viene = (f.enProceso || 0) + (f.porEntrar || 0)
    return { f, n, disp, viene, conViene: disp + viene, hoy: estadoAviso(disp, n), despues: estadoAviso(disp + viene, n) }
  }).filter((x) => !x.n.sinMovimiento && (x.hoy !== 'ok' || x.despues !== 'ok'))
    .sort((a, b) => ORDEN_AVISO[a.despues] - ORDEN_AVISO[b.despues] || ORDEN_AVISO[a.hoy] - ORDEN_AVISO[b.hoy] || (a.conViene - a.n.reorden) - (b.conViene - b.n.reorden))
  const conteo = (k) => lista.filter((x) => x.despues === k).length
  return (
    <section className="frisa-restock__seccion frisa-aviso">
      <h2 className="section-title section-title--small">{titulo}</h2>
      {!lista.length
        ? <p className="frisa__ok">Todo arriba del punto de reorden ✓</p>
        : <>
          <p className="frisa__sub">
            Con lo que viene: {conteo('critico') ? <><strong className="frisa__falta">{conteo('critico')} en CRÍTICO</strong> · </> : ''}
            {conteo('pedir') ? <><strong>{conteo('pedir')} en PEDIR</strong> · </> : ''}
            {conteo('cerca') ? <><strong>{conteo('cerca')} CERCA</strong> (para el siguiente pedido ya van a hacer falta) · </> : ''}
            {conteo('ok') ? <>{conteo('ok')} ya cubiertas · </> : ''}
            <strong>Hoy</strong> es con lo que hay (igual que Niveles); <strong>Con lo que viene</strong> suma lo que está en órdenes de taller o pedidos que no han llegado. CERCA = a menos de 20% arriba del punto de reorden.
          </p>
          <div className="revision__tabla-wrap">
            <table className="simple-table frisa-tabla frisa-niveles__tabla">
              <thead><tr><th className="frisa-aviso__prod">Producto</th><th className="num">Inventario actual</th><th className="num">Punto de reorden</th><th className="num">Máximo</th><th>Hoy</th><th className="num">En camino</th><th className="num">Con lo que viene</th><th>Después</th></tr></thead>
              <tbody>
                {lista.map(({ f, n, disp, viene, conViene, hoy, despues }) => (
                  <tr key={f.producto.id} className={'frisa-niveles__fila--' + (despues === 'cerca' || despues === 'ok' ? 'ok' : despues)}>
                    <td data-label="Producto"><NombreFrisa producto={f.producto} className="frisa__prod" /></td>
                    <td data-label="Inventario actual" className="num"><strong>{num(disp)}</strong></td>
                    <td data-label="Punto de reorden" className="num">{num(n.reorden)}</td>
                    <td data-label="Máximo" className="num">{num(n.maximo)}</td>
                    <td data-label="Hoy"><BadgeAviso estado={hoy} /></td>
                    <td data-label="En camino" className="num">{viene ? num(viene) : ''}</td>
                    <td data-label="Con lo que viene" className="num"><strong>{num(conViene)}</strong></td>
                    <td data-label="Después">{despues === 'ok' ? <span className="frisa-nivel frisa-nivel--verde">CUBIERTA</span> : <BadgeAviso estado={despues} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}
    </section>
  )
}

function TablaRestock({ filas }) {
  if (!filas.length) return <p className="frisa__ok">Nada por pedir: todas las claves están arriba del reorden (contando lo que ya viene).</p>
  return (
    <div className="revision__tabla-wrap">
      <table className="simple-table frisa-tabla frisa-niveles__tabla">
        <thead>
          <tr><th>Producto</th><th className="num">Disponible</th><th className="num">En proceso</th><th className="num">Por entrar</th><th className="num">Proyectado</th><th className="num">Reorden</th><th className="num">Máximo</th><th>Estado</th><th className="num">A PEDIR</th><th>Se</th></tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.producto.id} className={'frisa-niveles__fila--' + f.estado}>
              <td data-label="Producto"><NombreFrisa producto={f.producto} className="frisa__prod" /></td>
              <td data-label="Disponible" className="num">{num(f.disponible)}</td>
              <td data-label="En proceso" className="num">{f.enProceso ? num(f.enProceso) : ''}</td>
              <td data-label="Por entrar" className="num">{f.porEntrar ? num(f.porEntrar) : ''}</td>
              <td data-label="Proyectado" className="num"><strong>{num(f.proyectado)}</strong></td>
              <td data-label="Reorden" className="num">{num(f.reorden)}</td>
              <td data-label="Máximo" className="num">{num(f.maximo)}</td>
              <td data-label="Estado"><EstadoBadge estado={f.estado} /></td>
              <td data-label="A PEDIR" className="num"><strong>{f.aPedir ? num(f.aPedir) : ''}</strong></td>
              <td data-label="Se">{f.se === 'fabrica' ? 'Taller' : 'Compra'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Todas las tallas del producto: las sugeridas ya traen cantidad; las demás en blanco para agregarlas.
function PropuestaTaller({ grupo, productoFrisa, puede, onListo, onCerrar }) {
  const [cant, setCant] = useState(() => Object.fromEntries(grupo.lineas.map((l) => [l.producto_id, l.cantidad > 0 ? String(l.cantidad) : ''])))
  const [fecha, setFecha] = useState(masDias(10))
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState(null)
  const total = grupo.lineas.reduce((t, l) => t + (Number(cant[l.producto_id]) || 0), 0)

  async function crear() {
    setTrabajando(true)
    setError(null)
    const lineas = grupo.lineas.map((l) => ({ ...l, cantidad: Number(cant[l.producto_id]) || 0 }))
    const { data: orden, error: e } = await createOrderFrisa({
      productoId: grupo.producto_frisa_id, requestedDeliveryDate: fecha, items: itemsOrdenRestock(productoFrisa, lineas),
      description: 'Restock del inventario de Frisa', foliosExternos: [], llevaBordado: false,
    })
    if (e) { setTrabajando(false); return setError(e.message) }
    const { error: e2 } = await ligarOrden(orden.id, 'restock')
    setTrabajando(false)
    if (e2) return setError(`Se creó la orden ${orden.order_number} pero no se pudo ligar: ${e2.message}. Lígala abajo con su folio.`)
    onListo(`Se creó la orden de taller ${orden.order_number} (${nombreFrisa(productoFrisa?.nombre)}, ${num(total)} pzas). Ya está en las estaciones.`)
  }

  return (
    <div className="card frisa-restock__propuesta">
      <h3 className="section-title section-title--small">Orden de taller: {nombreFrisa(productoFrisa?.nombre)}</h3>
      <div className="frisa-restock__tallas">
        {grupo.lineas.map((l) => (
          <label key={l.producto_id} className={l.sugerido > 0 ? '' : 'frisa-restock__talla--extra'}>
            <span className="field-label">{l.talla}</span>
            <input className="input frisa-input" type="number" min="0" step="1" inputMode="numeric" value={cant[l.producto_id]} placeholder="0"
              disabled={!puede} onChange={(e) => setCant({ ...cant, [l.producto_id]: e.target.value })} aria-label={`Talla ${l.talla}`} />
            {l.sugerido > 0 && <span className="frisa__sub">sugerido {num(l.sugerido)}</span>}
          </label>
        ))}
        <label><span className="field-label">Entrega</span><input className="input" type="date" value={fecha} disabled={!puede} onChange={(e) => setFecha(e.target.value)} /></label>
      </div>
      {error && <p className="form-error">{error}</p>}
      {puede
        ? <div className="frisa__botones">
            <button type="button" className="btn btn--primary" disabled={trabajando || total <= 0} onClick={crear}>{trabajando ? 'Creando…' : `Crear orden de taller (${num(total)} pzas)`}</button>
            {onCerrar && <button type="button" className="btn btn--ghost" onClick={onCerrar}>Quitar</button>}
          </div>
        : <p className="frisa__sub">Las órdenes FR las crea ventas, admin de tienda o el administrador general.</p>}
    </div>
  )
}

// Pedido de compra (pantalón, bata, bolsa): como el de playera lisa. Arriba lo que hay que
// pedir (CRÍTICO / PEDIR, ya con cantidad) y abajo TODOS los demás que se compran, en 0, por si
// se quiere agregar algo.
const ESTADO_COMPRA = { critico: ['CRÍTICO', 'rojo'], pedir: ['PEDIR', 'naranja'], ok: ['OK', 'verde'] }
function PropuestaCompra({ filas, puede, onListo }) {
  const ORD = { critico: 0, pedir: 1, ok: 2 }
  const lista = [...filas].sort((a, b) => (b.aPedir > 0) - (a.aPedir > 0) || ORD[a.estado] - ORD[b.estado] || a.producto.clave.localeCompare(b.producto.clave))
  const [cant, setCant] = useState(() => Object.fromEntries(filas.map((f) => [f.producto.id, f.aPedir > 0 ? String(f.aPedir) : ''])))
  const [proveedor, setProveedor] = useState('')
  const [fecha, setFecha] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState(null)
  const total = filas.reduce((t, f) => t + (Number(cant[f.producto.id]) || 0), 0)
  const aPedir = lista.filter((f) => f.aPedir > 0).length

  async function crear() {
    setTrabajando(true)
    setError(null)
    const ls = filas.map((f) => ({ producto_id: f.producto.id, cantidad: Number(cant[f.producto.id]) || 0 })).filter((l) => l.cantidad > 0)
    const { data, error: e } = await crearCompra({ proveedor, fechaEsperada: fecha, lineas: ls })
    setTrabajando(false)
    if (e) return setError(e.message)
    onListo(`Se creó el pedido de compra #${data.folio} a ${data.proveedor} (${num(total)} pzas).`)
  }

  const fila = (f) => {
    const [et, color] = ESTADO_COMPRA[f.estado] || ESTADO_COMPRA.ok
    return (
      <tr key={f.producto.id} className={f.aPedir > 0 ? 'frisa-niveles__fila--' + f.estado : 'frisa-niveles__fila--ok'}>
        <td data-label="Producto"><NombreFrisa producto={f.producto} className="frisa__prod" /></td>
        <td data-label="Hay" className="num">{num(f.disponible)}</td>
        <td data-label="En camino" className="num">{f.enProceso + f.porEntrar ? num(f.enProceso + f.porEntrar) : ''}</td>
        <td data-label="Reorden" className="num">{num(f.reorden)}</td>
        <td data-label="Máximo" className="num">{num(f.maximo)}</td>
        <td data-label="Estado"><span className={'frisa-nivel frisa-nivel--' + color}>{et}</span></td>
        <td data-label="A pedir" className="num">
          <input className="input frisa-input" type="number" min="0" step="1" inputMode="numeric" value={cant[f.producto.id]} placeholder="0"
            disabled={!puede} onChange={(e) => setCant({ ...cant, [f.producto.id]: e.target.value })} aria-label={`A pedir ${nombreFrisa(f.producto.nombre)}`} />
        </td>
      </tr>
    )
  }

  return (
    <div className="card frisa-restock__propuesta">
      <h3 className="section-title section-title--small">Pedido de compra (lo que se compra hecho)</h3>
      <p className="frisa__sub">
        <strong>Hay</strong> = disponible en bodega · <strong>En camino</strong> = pedidos que no han llegado.
        {aPedir ? ` Arriba las ${aPedir} que hay que pedir (ya traen la cantidad para llegar al máximo);` : ' Ahorita nada está en reorden;'} abajo todas las demás, en 0, por si quieres agregar alguna. Puedes cambiar cualquier cantidad.
      </p>
      <div className="revision__tabla-wrap">
        <table className="simple-table frisa-tabla frisa-niveles__tabla">
          <thead><tr><th>Producto</th><th className="num">Hay</th><th className="num">En camino</th><th className="num">Reorden</th><th className="num">Máximo</th><th>Estado</th><th className="num">A pedir</th></tr></thead>
          <tbody>
            {lista.filter((f) => f.aPedir > 0).map(fila)}
            {aPedir > 0 && aPedir < lista.length && (
              <tr><td colSpan={7} className="frisa__sub"><strong>Los demás que se compran</strong> (alcanzan; agrega si quieres)</td></tr>
            )}
            {lista.filter((f) => !(f.aPedir > 0)).map(fila)}
          </tbody>
        </table>
      </div>
      {puede ? (
        <>
          <div className="frisa-form__fila">
            <label><span className="field-label">Proveedor</span><input className="input" value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Quién nos lo fabrica" /></label>
            <label><span className="field-label">Se espera (opcional)</span><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="button" className="btn btn--primary" disabled={trabajando || total <= 0 || !proveedor.trim()} onClick={crear}>{trabajando ? 'Guardando…' : `Crear pedido de compra (${num(total)} pzas)`}</button>
        </>
      ) : <p className="frisa__sub">Los pedidos de compra los hacen los administradores.</p>}
    </div>
  )
}

function ListaOrdenes({ filas, pfPorId, puede, onSubir, onListo }) {
  const [error, setError] = useState(null)
  async function quitar(f) {
    if (!window.confirm(`¿Quitar la orden ${f.order?.order_number} del restock? La orden sigue en las estaciones; solo deja de contar para el inventario de Frisa.`)) return
    const { error: e } = await desligarOrden(f.liga.order_id)
    if (e) return setError(e.message)
    onListo(`La orden ${f.order?.order_number} ya no cuenta en el restock.`)
  }
  return (
    <div className="frisa-oc-lista">
      {error && <p className="form-error">{error}</p>}
      {filas.map((f) => {
        const pf = pfPorId.get(f.order?.producto_frisa_id)
        const [label, clase] = ESTADO_OT[f.estado]
        return (
          <div key={f.liga.order_id} className="card frisa-surtido__tarjeta frisa-restock__orden">
            <span className="frisa-surtido__fila1">
              <span className="frisa-oc__num">{f.order?.order_number || 'Orden'}</span>
              <span className={'frisa-nivel frisa-nivel--' + clase}>{label}</span>
            </span>
            <span className="frisa-oc__planta">{nombreFrisa(pf?.nombre)}</span>
            <span className="frisa__sub">{num(f.piezas)} pzas{f.order?.requested_delivery_date ? ` · entrega ${fechaCorta(f.order.requested_delivery_date)}` : ''}</span>
            <span className="frisa__botones">
              {f.estado === 'por_entrar' && puede.bodega && <button type="button" className="btn btn--primary btn--small" onClick={() => onSubir(f)}>Subir a bodega</button>}
              {f.estado === 'en_proceso' && puede.ordenes && <button type="button" className="btn btn--ghost btn--small" onClick={() => quitar(f)}>Quitar del restock</button>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function LigarExistente({ onListo }) {
  const [folio, setFolio] = useState('')
  const [error, setError] = useState(null)
  async function ligar(e) {
    e.preventDefault()
    setError(null)
    const { data, error: e1 } = await buscarOrdenPorFolio(folio)
    if (e1) return setError(e1.message)
    if (!data) return setError(`No encontré la orden ${folio}.`)
    const { error: e2 } = await ligarOrden(data.id, 'ligada')
    if (e2) return setError(e2.message)
    setFolio('')
    onListo(`La orden ${data.order_number} ya cuenta en el restock.`)
  }
  return (
    <form className="frisa-niveles__captura" onSubmit={ligar}>
      <label className="frisa-niveles__captura-comentario">
        <span className="field-label">Ligar una orden FR que ya existe</span>
        <input className="input" value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="Ej. FR-012" />
      </label>
      <button type="submit" className="btn btn--secondary" disabled={!folio.trim()}>Ligar</button>
      {error && <p className="form-error">{error}</p>}
    </form>
  )
}

function ModalIngreso({ fila, datos, pfPorId, onClose, onListo }) {
  const { lineas, sinClave } = propuestaIngreso(fila.order, datos.clavesProducto)
  const [cant, setCant] = useState(() => Object.fromEntries(lineas.map((l) => [l.producto_id, String(l.cantidad)])))
  const [notas, setNotas] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState(null)
  const prod = (id) => datos.productos.find((p) => p.id === id)
  const total = lineas.reduce((t, l) => t + (Number(cant[l.producto_id]) || 0), 0)

  async function guardar(e) {
    e.preventDefault()
    setTrabajando(true)
    setError(null)
    const { error: err } = await subirABodega(fila.liga.order_id, lineas.map((l) => ({ producto_id: l.producto_id, cantidad: Number(cant[l.producto_id]) || 0 })), notas)
    setTrabajando(false)
    if (err) return setError(err.message)
    onListo(`Se subieron ${num(total)} piezas de ${fila.order.order_number} a la bodega.`)
  }

  return (
    <Modal title={`Subir a bodega · ${fila.order.order_number}`} onClose={onClose}>
      <form className="frisa-niveles__supuestos" onSubmit={guardar}>
        <p className="frisa__nota">{pfPorId.get(fila.order.producto_frisa_id)?.nombre}. Corrige si subieron menos (merma, defectos).</p>
        <div className="revision__tabla-wrap">
          <table className="simple-table frisa-tabla">
            <tbody>
              {lineas.map((l) => (
                <tr key={l.producto_id}>
                  <td><NombreFrisa producto={prod(l.producto_id)} className="frisa__prod" /></td>
                  <td className="num"><input className="input frisa-input" type="number" min="0" step="1" inputMode="numeric" value={cant[l.producto_id]}
                    onChange={(e) => setCant({ ...cant, [l.producto_id]: e.target.value })} aria-label={`Piezas talla ${l.talla}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sinClave.length > 0 && <p className="frisa__falta">Sin clave de inventario (no se suman): {sinClave.map((s) => `${s.talla} ×${s.cantidad}`).join(', ')}.</p>}
        <label><span className="field-label">Notas (opcional)</span><input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="frisa__botones">
          <button type="submit" className="btn btn--primary" disabled={trabajando || total <= 0}>{trabajando ? 'Guardando…' : `Confirmar: subir ${num(total)} pzas`}</button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}

function ModalRecibir({ compra, lineas, onClose, onListo }) {
  const [cant, setCant] = useState(() => Object.fromEntries(lineas.map((l) => [l.key, String(l.cantidad)])))
  const [notas, setNotas] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState(null)
  const total = lineas.reduce((t, l) => t + (Number(cant[l.key]) || 0), 0)
  async function guardar(e) {
    e.preventDefault()
    setTrabajando(true)
    setError(null)
    const { error: err } = await recibirCompra(compra.id, lineas.map((l) => ({
      ...(l.lisa_id ? { lisa_id: l.lisa_id } : { producto_id: l.producto_id }), cantidad: Number(cant[l.key]) || 0,
    })), notas)
    setTrabajando(false)
    if (err) return setError(err.message)
    onListo(`Compra #${compra.folio} recibida: ${num(total)} piezas a la bodega.`)
  }
  return (
    <Modal title={`Recibir compra #${compra.folio} · ${compra.proveedor}`} onClose={onClose}>
      <form className="frisa-niveles__supuestos" onSubmit={guardar}>
        <p className="frisa__nota">Escribe lo que llegó de verdad.</p>
        {lineas.map((l) => (
          <label key={l.key} className="frisa-niveles__supuesto">
            <span className="field-label">{l.clave} · pedidas {num(l.cantidad)}</span>
            <input className="input frisa-input" type="number" min="0" step="1" inputMode="numeric" value={cant[l.key]} onChange={(e) => setCant({ ...cant, [l.key]: e.target.value })} />
          </label>
        ))}
        <label><span className="field-label">Notas (opcional)</span><input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="frisa__botones">
          <button type="submit" className="btn btn--primary" disabled={trabajando || total <= 0}>{trabajando ? 'Guardando…' : `Recibir ${num(total)} pzas`}</button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}

function BotonCancelarCompra({ compra, onListo }) {
  async function cancelar() {
    const motivo = window.prompt(`¿Por qué se cancela la compra #${compra.folio}?`)
    if (!motivo || !motivo.trim()) return
    const { error } = await cancelarCompra(compra.id, motivo)
    if (error) return window.alert(error.message)
    onListo(`Compra #${compra.folio} cancelada.`)
  }
  return <button type="button" className="btn btn--ghost btn--small" onClick={cancelar}>Cancelar</button>
}



function ListaCompras({ titulo, compras, datos, puede, onRecibir, onListo, destacada = false, puedeRecibir = false }) {
  const lisaPorId = new Map(datos.lisas.map((x) => [x.id, x]))
  return (
    <section className={'frisa-restock__seccion' + (destacada ? ' card frisa-restock__propuesta' : '')}>
      <h2 className="section-title section-title--small">{titulo}</h2>
      {destacada && <p className="frisa__sub">Cuando llegue, toca <strong>Recibir</strong> y escribe lo que llegó de verdad: ahí se suma al inventario.</p>}
      {!compras.length && <p className="frisa__sub">Ninguno todavía.</p>}
      <div className="frisa-oc-lista">
        {compras.slice(0, 20).map((c) => {
          // Por prenda, con su talla (sin claves): "Pantalón de mezclilla" → 30: 15, 31: 5…
          const prodPorId = new Map(datos.productos.map((x) => [x.id, x]))
          const ls = [
            ...datos.compraLineas.filter((l) => l.compra_id === c.id).map((l) => ({ ...l, ...prendaYTalla(prodPorId.get(l.producto_id)?.nombre || l.clave) })),
            ...datos.compraLineasLisa.filter((l) => l.compra_id === c.id).map((l) => {
              const li = lisaPorId.get(l.lisa_id)
              return { ...l, prenda: `Playera lisa ${li?.color || ''} manga ${li?.manga === 'ML' ? 'larga' : 'corta'}`, talla: li?.talla || '' }
            }),
          ]
          const grupos = []
          for (const l of ls) {
            let g = grupos.find((x) => x.prenda === l.prenda)
            if (!g) { g = { prenda: l.prenda, lineas: [] }; grupos.push(g) }
            g.lineas.push(l)
          }
          return (
            <div key={c.id} className="card frisa-surtido__tarjeta frisa-restock__compra">
              <span className="frisa-surtido__fila1">
                <span className="frisa-oc__num">Compra #{c.folio}</span>
                <span className={'frisa-nivel frisa-nivel--' + (c.estado === 'recibida' ? 'verde' : c.estado === 'pedida' ? 'naranja' : 'neutro')}>
                  {c.estado === 'pedida' ? 'Pedida' : c.estado === 'recibida' ? 'Recibida' : 'Cancelada'}
                </span>
              </span>
              <span className="frisa-oc__planta">{c.proveedor}</span>
              {grupos.map((g) => (
                <div key={g.prenda} className="frisa-compra__tallas">
                  <div className="frisa-compra__prenda">{g.prenda.charAt(0) + g.prenda.slice(1).toLowerCase()} · {num(g.lineas.reduce((t, l) => t + l.cantidad, 0))} pzas</div>
                  <table className="frisa-compra__tabla">
                    <tbody>
                      <tr><th>Talla</th>{g.lineas.map((l) => <td key={l.id}>{l.talla}</td>)}</tr>
                      <tr><th>Piezas</th>{g.lineas.map((l) => <td key={l.id}><strong>{num(l.cantidad)}</strong></td>)}</tr>
                      {g.lineas.some((l) => l.recibida != null) && <tr><th>Llegaron</th>{g.lineas.map((l) => <td key={l.id}>{l.recibida != null ? num(l.recibida) : '—'}</td>)}</tr>}
                    </tbody>
                  </table>
                </div>
              ))}
              <span className="frisa__sub">{c.estado === 'pedida' ? (c.fecha_esperada ? `Se espera ${fechaCorta(c.fecha_esperada)}` : 'Sin fecha') : c.estado === 'recibida' ? `Recibió ${c.recibido_por_nombre} · ${fechaCorta(c.recibido_en)}` : c.cancelado_motivo}</span>
              {c.estado === 'pedida' && (
                <span className="frisa__botones">
                  {puedeRecibir && <button type="button" className="btn btn--primary btn--small" onClick={() => onRecibir(c)}>Recibir</button>}
                  {puede.compras && <BotonCancelarCompra compra={c} onListo={onListo} />}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
