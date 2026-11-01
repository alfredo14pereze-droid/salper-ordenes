import { useCallback, useEffect, useState } from 'react'
import {
  fetchOrdenFacturacion,
  fetchOrdenTotales,
  fetchRazonesSociales,
  fetchUltimoPrecio,
  fetchResumenEntrega,
  setOrdenLineas,
  setOrdenFacturacion,
  setOrdenFacturacionManual,
  formatMxn,
  REGIMENES_FISCALES,
  USOS_CFDI,
} from '../../services/finanzasService'
import RazonesSocialesManager from '../finanzas/RazonesSocialesManager'
import PdfPreviewModal from '../pdf/PdfPreviewModal'
import { buildEntregaPdfBlob, entregaPdfFileName } from '../../utils/generateEntregaPdf'
import { useAuth } from '../../contexts/AuthContext'
import { canEditFinanzas } from '../../utils/permissions'
import { esOrdenMostrador, filasDeRenglones, lineasDeFilas, resumenPago } from '../../utils/preciosLineas'
import { claveTalla, estadoDesdePrecios, precioDeTalla } from '../../utils/preciosPrenda'
import PreciosPrendaEditor from './PreciosPrendaEditor'
import VentaMostradorToggle from './VentaMostradorToggle'
import { usePedidoDeOrden } from '../../hooks/usePedidoDeOrden'
import { refrescarLineasMostrador } from '../../hooks/useLineasMostrador'

// V144 — datos fiscales capturados a mano (orden de un cliente no registrado).
const FISCAL_VACIO = { razon_social: '', rfc: '', regimen_fiscal: '', cp_fiscal: '', uso_cfdi: '', correo_factura: '' }
const FISCAL_OBLIGATORIOS = ['razon_social', 'rfc', 'regimen_fiscal', 'cp_fiscal', 'uso_cfdi']

// Precios + facturación + totales de la orden (V77). Desde V159 el precio es
// por LÍNEA (prenda + talla) y cada línea puede ser "venta de mostrador" (no
// pide precio ni suma). Las órdenes viejas muestran el precio por prenda de
// V77 en cada talla y sus extras por pieza se siguen sumando. Los números
// (subtotal, IVA, total, saldo y qué falta) los calcula Supabase
// (orden_totales); aquí solo se capturan y se muestran. Solo lo montan los
// roles que pueden ver dinero (ver OrderDetailPage).
//
// Fase 1A/1B — "Venta de mostrador" es de toda la orden (interruptor arriba;
// al guardar, todas las líneas quedan de mostrador y sin factura) y el precio
// se captura por prenda ("Mismo precio" / "Precios por talla"). Se sigue
// guardando un precio por línea con set_orden_lineas, igual que en V159.

// Prendas para el editor a partir de las filas (una por talla con piezas).
// Las tallas marcadas antes como mostrador (V159, por línea) no llevan precio.
function prendasDeFilas(filas) {
  const porPrenda = new Map()
  for (const f of filas) {
    if (!porPrenda.has(f.itemIndex)) {
      porPrenda.set(f.itemIndex, { key: f.itemIndex, nombre: f.prenda, extrasPorPieza: f.extrasPorPieza, tallas: [], mostradorPrevio: [] })
    }
    const p = porPrenda.get(f.itemIndex)
    const t = claveTalla(f.talla)
    if (f.ventaMostrador) {
      if (!p.mostradorPrevio.includes(t)) p.mostradorPrevio.push(t)
      continue
    }
    const ya = p.tallas.find((x) => x.talla === t)
    if (ya) ya.cantidad += f.cantidad
    else p.tallas.push({ talla: t, cantidad: f.cantidad })
  }
  return [...porPrenda.values()]
}

function estadosDeFilas(filas) {
  const out = {}
  for (const p of prendasDeFilas(filas)) {
    const precios = filas
      .filter((f) => f.itemIndex === p.key && !f.ventaMostrador)
      .map((f) => ({ talla: f.talla, precio: f.precioTexto }))
    out[p.key] = estadoDesdePrecios(precios)
  }
  return out
}

export default function OrderFacturacionCard({ order, onUpdated }) {
  const { role } = useAuth()
  // V176 — en un pedido, la factura es del pedido; si el pedido es de
  // mostrador, la orden también (no se puede apagar aquí).
  const pedido = usePedidoDeOrden(order)
  const enPedido = !!order.pedido_id
  const mostradorPorPedido = !!pedido?.es_mostrador
  const readOnly =
    !canEditFinanzas(role) || order.status === 'completado' || !!order.eliminada_en || !!order.cancelled_at

  // Una fila por talla con piezas (item_index/size_index de order.items).
  const [filas, setFilas] = useState([])
  const [estados, setEstados] = useState({})
  const [ventaMostrador, setVentaMostrador] = useState(false)
  const [requiere, setRequiere] = useState(false)
  const [incluyeIva, setIncluyeIva] = useState(true)
  const [razonId, setRazonId] = useState('')
  const [razones, setRazones] = useState([])
  const [snapshot, setSnapshot] = useState(null)
  const [fiscal, setFiscal] = useState(FISCAL_VACIO)
  const [totales, setTotales] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showNuevaRazon, setShowNuevaRazon] = useState(false)
  const [preview, setPreview] = useState(null)
  const [generating, setGenerating] = useState(false)

  const loadRazones = useCallback(async () => {
    if (!order.client_id) return []
    const { data } = await fetchRazonesSociales(order.client_id)
    setRazones(data || [])
    return data || []
  }, [order.client_id])

  const load = useCallback(async () => {
    const [f, t, rz] = await Promise.all([
      fetchOrdenFacturacion(order.id),
      fetchOrdenTotales(order.id),
      loadRazones(),
    ])
    if (t.error) setError(t.error)
    const next = filasDeRenglones(t.data?.renglones).map((fila) => ({
      ...fila,
      precioTexto: fila.precioUnitario == null ? '' : String(fila.precioUnitario),
      sugerido: false,
    }))
    // Sugerencia: último precio cobrado a este cliente por la misma prenda (editable).
    if (order.client_id && canEditFinanzas(role)) {
      const prendas = [...new Set(next.filter((x) => !x.ventaMostrador && x.precioTexto === '').map((x) => x.prenda))]
      const sugeridos = Object.fromEntries(
        await Promise.all(prendas.map(async (prenda) => [prenda, (await fetchUltimoPrecio(order.client_id, prenda)).data]))
      )
      for (const fila of next) {
        const sug = sugeridos[fila.prenda]
        if (!fila.ventaMostrador && fila.precioTexto === '' && sug?.precio_unitario != null) {
          fila.precioTexto = String(sug.precio_unitario)
          fila.precioUnitario = Number(sug.precio_unitario)
          fila.sugerido = true
        }
      }
    }
    // Toda la orden de mostrador → interruptor encendido (y las filas se tratan
    // como normales por si lo apagan).
    const todaMostrador = esOrdenMostrador(next)
    const filasBase = todaMostrador ? next.map((x) => ({ ...x, ventaMostrador: false })) : next
    setVentaMostrador(todaMostrador)
    setFilas(filasBase)
    setEstados(estadosDeFilas(filasBase))
    setRequiere(!!f.data?.requiere_factura)
    setIncluyeIva(f.data ? f.data.precios_incluyen_iva : true)
    setRazonId(f.data?.razon_social_id || '')
    setSnapshot(f.data?.fiscal_snapshot || null)
    setFiscal(Object.fromEntries(Object.keys(FISCAL_VACIO).map((k) => [k, f.data?.fiscal_snapshot?.[k] || ''])))
    setTotales(t.data || null)
    setDirty(false)
    setLoading(false)
  }, [order.id, order.client_id, role, loadRazones])

  useEffect(() => {
    load()
  }, [load])

  function cambiarPrecioPrenda(key, estado) {
    setEstados((prev) => ({ ...prev, [key]: estado }))
    setFilas((actuales) => actuales.map((x) => (x.itemIndex === key ? { ...x, sugerido: false } : x)))
    setDirty(true)
  }

  function handleMostrador(value) {
    setVentaMostrador(value)
    setDirty(true)
  }

  function handleRequiere(value) {
    setRequiere(value)
    if (value && !razonId) {
      const pred = razones.find((r) => r.predeterminada) || (razones.length === 1 ? razones[0] : null)
      if (pred) setRazonId(pred.id)
    }
    setDirty(true)
  }

  // Filas con el precio que sale de la captura por prenda.
  const filasEnPantalla = filas.map((f) =>
    f.ventaMostrador ? f : { ...f, precioUnitario: precioDeTalla(estados[f.itemIndex], f.talla), precioTexto: precioDeTalla(estados[f.itemIndex], f.talla) }
  )

  async function handleSave() {
    setSaving(true)
    setError(null)
    // Líneas sin precio y sin mostrador no se guardan: quedan "falta precio".
    const lineas = ventaMostrador ? lineasDeFilas(filas.map((f) => ({ ...f, ventaMostrador: true }))) : lineasDeFilas(filasEnPantalla)
    const { error: pErr } = await setOrdenLineas(order.id, lineas)
    if (pErr) {
      setSaving(false)
      setError(pErr)
      return
    }
    refrescarLineasMostrador(order.id)
    // Sin cliente del catálogo y con factura: datos fiscales a mano (V144).
    // Venta de mostrador: sin factura. En un pedido, la factura es del pedido.
    const requiereFinal = ventaMostrador || enPedido ? false : requiere
    const { error: fErr } =
      !order.client_id && requiereFinal
        ? await setOrdenFacturacionManual({ orderId: order.id, requiere: requiereFinal, incluyeIva, fiscal })
        : await setOrdenFacturacion({
            orderId: order.id,
            requiere: requiereFinal,
            incluyeIva,
            razonSocialId: requiereFinal ? razonId : null,
          })
    setSaving(false)
    if (fErr) {
      setError(fErr)
      await load()
      return
    }
    await load()
    onUpdated?.()
  }

  async function handleResumen() {
    setGenerating(true)
    setError(null)
    try {
      const { data, error: rErr } = await fetchResumenEntrega(order.id)
      if (rErr) throw rErr
      const blob = await buildEntregaPdfBlob(data)
      setPreview({ blob, fileName: entregaPdfFileName(order) })
    } catch (err) {
      setError(err)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <p className="page-subtitle">Cargando precios…</p>

  const sinCliente = !order.client_id
  const faltantes = totales?.faltantes
  const sinPrecio = faltantes?.renglones_sin_precio || []
  const conSugerencia = filas.some((x) => x.sugerido)
  const enPantalla = resumenPago(filasEnPantalla)
  const fiscalIncompleto = FISCAL_OBLIGATORIOS.some((k) => !fiscal[k].trim())
  const setFiscalCampo = (campo, valor) => {
    setFiscal((prev) => ({ ...prev, [campo]: valor }))
    setDirty(true)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h3 className="section-title section-title--small" style={{ margin: 0 }}>
          Precios y facturación
        </h3>
        <button type="button" className="btn btn--secondary" onClick={handleResumen} disabled={generating || dirty}>
          {generating ? 'Generando…' : 'Resumen de entrega'}
        </button>
      </div>
      {dirty && !readOnly && <p className="page-subtitle" style={{ margin: '6px 0 0' }}>Hay cambios sin guardar: guarda para ver los totales y el resumen.</p>}

      {filas.length > 0 && (
        <div style={{ margin: '10px 0' }}>
          <VentaMostradorToggle
            checked={ventaMostrador}
            onChange={handleMostrador}
            disabled={readOnly || (mostradorPorPedido && ventaMostrador)}
            nota={mostradorPorPedido ? `El pedido ${pedido.folio} es de venta de mostrador: esta orden también.` : null}
          />
        </div>
      )}

      {filas.length === 0 ? (
        <p className="page-subtitle">Esta orden todavía no tiene prendas con piezas.</p>
      ) : ventaMostrador ? null : (
        <>
          <PreciosPrendaEditor prendas={prendasDeFilas(filas)} estados={estados} onChange={cambiarPrecioPrenda} disabled={readOnly} />
          {dirty && (
            <p className="page-subtitle" style={{ textAlign: 'right' }}>
              Total en pantalla (sin guardar): <b>{formatMxn(enPantalla.total)}</b>
            </p>
          )}
        </>
      )}
      {conSugerencia && !readOnly && <p className="page-subtitle">Los precios sugeridos no se guardan hasta que pulses "Guardar precios y facturación".</p>}

      {!ventaMostrador && enPedido && (
        <p className="pantone-hint" style={{ marginTop: 12 }}>
          La factura de esta orden se maneja en su pedido{pedido ? ` ${pedido.folio}` : ''}.
        </p>
      )}
      {!ventaMostrador && !enPedido && (
      <div className="order-form" style={{ marginTop: 12 }}>
        <label className="fin-check">
          <input type="checkbox" checked={requiere} disabled={readOnly} onChange={(e) => handleRequiere(e.target.checked)} />
          <strong>¿Requiere factura?</strong>
        </label>
        <label className="fin-check">
          <input type="checkbox" checked={incluyeIva} disabled={readOnly} onChange={(e) => { setIncluyeIva(e.target.checked); setDirty(true) }} />
          Los precios ya incluyen IVA <span className="page-subtitle">(si no, se les suma 16% cuando hay factura)</span>
        </label>
        {requiere && sinCliente && (
          <div className="order-form">
            <p className="page-subtitle">
              Cliente no registrado: captura aquí sus datos fiscales (se guardan solo en esta orden). Puedes dejarlos para después, pero se necesitan completos para marcar la orden como entregada.
            </p>
            <div className="form-row">
              <label>
                Razón social
                <input type="text" className="input" value={fiscal.razon_social} disabled={readOnly} onChange={(e) => setFiscalCampo('razon_social', e.target.value)} />
              </label>
              <label>
                RFC
                <input type="text" className="input" value={fiscal.rfc} disabled={readOnly} onChange={(e) => setFiscalCampo('rfc', e.target.value.toUpperCase())} />
              </label>
            </div>
            <div className="form-row">
              <label>
                Régimen fiscal
                <select className="input" value={fiscal.regimen_fiscal} disabled={readOnly} onChange={(e) => setFiscalCampo('regimen_fiscal', e.target.value)}>
                  <option value="">Selecciona…</option>
                  {[...new Set([fiscal.regimen_fiscal, ...REGIMENES_FISCALES])].filter(Boolean).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                Código postal fiscal
                <input type="text" inputMode="numeric" className="input" value={fiscal.cp_fiscal} disabled={readOnly} onChange={(e) => setFiscalCampo('cp_fiscal', e.target.value)} />
              </label>
            </div>
            <div className="form-row">
              <label>
                Uso de CFDI
                <select className="input" value={fiscal.uso_cfdi} disabled={readOnly} onChange={(e) => setFiscalCampo('uso_cfdi', e.target.value)}>
                  <option value="">Selecciona…</option>
                  {[...new Set([fiscal.uso_cfdi, ...USOS_CFDI])].filter(Boolean).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </label>
              <label>
                Correo para la factura
                <input type="email" className="input" value={fiscal.correo_factura} disabled={readOnly} onChange={(e) => setFiscalCampo('correo_factura', e.target.value)} placeholder="Opcional" />
              </label>
            </div>
            {fiscalIncompleto && <p className="fin-missing">Faltan datos fiscales (razón social, RFC, régimen, código postal y uso de CFDI).</p>}
          </div>
        )}
        {requiere && !sinCliente && (
          <label>
            Razón social para la factura *
            <div style={{ display: 'flex', gap: 8 }}>
              <select className="input" value={razonId} disabled={readOnly} onChange={(e) => { setRazonId(e.target.value); setDirty(true) }}>
                <option value="">Selecciona…</option>
                {razones.map((rz) => (
                  <option key={rz.id} value={rz.id}>
                    {rz.razon_social} · {rz.rfc}{rz.predeterminada ? ' (predeterminada)' : ''}
                  </option>
                ))}
              </select>
              {!readOnly && (
                <button type="button" className="btn btn--ghost" onClick={() => setShowNuevaRazon(true)}>
                  + Nueva
                </button>
              )}
            </div>
          </label>
        )}
        {requiere && !sinCliente && snapshot && !dirty && (
          <p className="razon-row__meta">
            Datos fiscales guardados en la orden: {snapshot.razon_social} · {snapshot.rfc} · {snapshot.regimen_fiscal} · CP {snapshot.cp_fiscal} · {snapshot.uso_cfdi}
          </p>
        )}
      </div>
      )}

      {!readOnly && (
        <button type="button" className="btn btn--primary" style={{ marginTop: 10 }} onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Guardando…' : ventaMostrador ? 'Guardar' : 'Guardar precios y facturación'}
        </button>
      )}
      {error && <p className="form-error">{error.message}</p>}

      {totales && !dirty && ventaMostrador && order.status !== 'completado' && (
        <p className={totales.lista_para_entregar ? 'fin-ok' : 'fin-missing'}>
          {totales.lista_para_entregar
            ? '✓ Venta de mostrador: se puede entregar sin precio, anticipo ni factura.'
            : 'Venta de mostrador, pero la orden todavía pide factura: pulsa "Guardar" para quitarla.'}
        </p>
      )}

      {totales && !dirty && !ventaMostrador && (
        <>
          <div className="totales-box">
            <div className="totales-box__row"><span>Subtotal</span><span>{formatMxn(totales.subtotal)}</span></div>
            {totales.requiere_factura && <div className="totales-box__row"><span>IVA 16%</span><span>{formatMxn(totales.iva)}</span></div>}
            <div className="totales-box__row totales-box__row--total"><span>Total</span><span>{formatMxn(totales.total)}</span></div>
            {enPedido ? (
              <div className="totales-box__row"><span>Saldo</span><span>en el pedido</span></div>
            ) : (
              <>
                <div className="totales-box__row"><span>Anticipos / abonos</span><span>− {formatMxn(totales.anticipos)}</span></div>
                <div className="totales-box__row totales-box__row--saldo"><span>Saldo pendiente</span><span>{formatMxn(totales.saldo)}</span></div>
              </>
            )}
          </div>
          {order.status === 'completado' ? null : totales.lista_para_entregar ? (
            <p className="fin-ok">✓ Precios y facturación completos: la orden puede entregarse.</p>
          ) : (
            <p className="fin-missing">
              Para poder entregarla falta:{' '}
              {[
                sinPrecio.length > 0 && `precio en ${sinPrecio.map((s) => `${s.prenda || `prenda ${s.item_index + 1}`}${s.talla ? ` ${s.talla}` : ''}`).join(', ')} (o marcar la orden como venta de mostrador)`,
                faltantes?.falta_razon_social && (sinCliente ? 'los datos fiscales de la factura' : 'la razón social de la factura'),
              ].filter(Boolean).join(' y ')}
              .
            </p>
          )}
        </>
      )}

      {showNuevaRazon && (
        <div className="mt-modal-overlay" onClick={() => setShowNuevaRazon(false)}>
          <div className="mt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mt-modal__head">
              <h3>Nueva razón social</h3>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowNuevaRazon(false)}>Cerrar</button>
            </div>
            <RazonesSocialesManager
              clienteId={order.client_id}
              startNew
              onSaved={async (rz) => {
                await loadRazones()
                setRazonId(rz.id)
                setRequiere(true)
                setDirty(true)
                setShowNuevaRazon(false)
              }}
            />
          </div>
        </div>
      )}
      {preview && <PdfPreviewModal blob={preview.blob} fileName={preview.fileName} onClose={() => setPreview(null)} />}
    </div>
  )
}
