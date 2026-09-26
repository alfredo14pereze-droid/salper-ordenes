import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchOrdenPrecios,
  fetchOrdenFacturacion,
  fetchOrdenTotales,
  fetchRazonesSociales,
  fetchUltimoPrecio,
  fetchResumenEntrega,
  setOrdenPrecios,
  setOrdenFacturacion,
  formatMxn,
} from '../../services/finanzasService'
import RazonesSocialesManager from '../finanzas/RazonesSocialesManager'
import PdfPreviewModal from '../pdf/PdfPreviewModal'
import { buildEntregaPdfBlob, entregaPdfFileName } from '../../utils/generateEntregaPdf'
import { useAuth } from '../../contexts/AuthContext'
import { canEditFinanzas } from '../../utils/permissions'

function cantidadDe(item) {
  return (item?.sizes || []).reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0)
}

// Precios por prenda + facturación + totales de la orden (V77). Los números
// (subtotal, IVA, total, saldo y qué falta) los calcula Supabase
// (orden_totales); aquí solo se capturan y se muestran. Solo lo montan los
// roles que pueden ver dinero (ver OrderDetailPage).
export default function OrderFacturacionCard({ order, onUpdated }) {
  const { role } = useAuth()
  const readOnly =
    !canEditFinanzas(role) || order.status === 'completado' || !!order.eliminada_en || !!order.cancelled_at

  // Renglones = prendas con piezas. item_index = posición en order.items.
  const renglones = useMemo(
    () =>
      (order.items || [])
        .map((item, index) => ({ index, item, cantidad: cantidadDe(item) }))
        .filter((r) => r.cantidad > 0),
    [order.items]
  )

  const [rows, setRows] = useState({}) // index -> { precio, extras:[{concepto,monto}], sugerido }
  const [requiere, setRequiere] = useState(false)
  const [incluyeIva, setIncluyeIva] = useState(true)
  const [razonId, setRazonId] = useState('')
  const [razones, setRazones] = useState([])
  const [snapshot, setSnapshot] = useState(null)
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
    const [p, f, t, rz] = await Promise.all([
      fetchOrdenPrecios(order.id),
      fetchOrdenFacturacion(order.id),
      fetchOrdenTotales(order.id),
      loadRazones(),
    ])
    if (p.error || t.error) setError(p.error || t.error)
    const next = {}
    for (const r of renglones) {
      const saved = (p.data || []).find((x) => x.item_index === r.index && x.prenda === (r.item.garment || ''))
      next[r.index] = saved
        ? { precio: String(saved.precio_unitario), extras: (saved.extras || []).map((e) => ({ concepto: e.concepto, monto: String(e.monto) })), sugerido: false }
        : { precio: '', extras: [], sugerido: false }
    }
    // Sugerencia: último precio cobrado a este cliente por la misma prenda (editable).
    if (order.client_id && canEditFinanzas(role)) {
      await Promise.all(
        renglones.map(async (r) => {
          if (next[r.index].precio !== '' || !r.item.garment) return
          const { data } = await fetchUltimoPrecio(order.client_id, r.item.garment)
          if (data?.precio_unitario != null) {
            next[r.index] = {
              precio: String(data.precio_unitario),
              extras: (data.extras || []).map((e) => ({ concepto: e.concepto, monto: String(e.monto) })),
              sugerido: true,
            }
          }
        })
      )
    }
    setRows(next)
    setRequiere(!!f.data?.requiere_factura)
    setIncluyeIva(f.data ? f.data.precios_incluyen_iva : true)
    setRazonId(f.data?.razon_social_id || '')
    setSnapshot(f.data?.fiscal_snapshot || null)
    setTotales(t.data || null)
    setDirty(false)
    setLoading(false)
  }, [order.id, order.client_id, renglones, role, loadRazones])

  useEffect(() => {
    load()
  }, [load])

  function patchRow(index, patch) {
    setRows((r) => ({ ...r, [index]: { ...r[index], sugerido: false, ...patch } }))
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

  async function handleSave() {
    setSaving(true)
    setError(null)
    const payload = renglones
      .filter((r) => rows[r.index]?.precio !== '' && rows[r.index]?.precio != null)
      .map((r) => ({
        item_index: r.index,
        prenda: r.item.garment || '',
        precio_unitario: Number(rows[r.index].precio),
        extras: (rows[r.index].extras || [])
          .filter((e) => e.concepto.trim() !== '' || e.monto !== '')
          .map((e) => ({ concepto: e.concepto.trim(), monto: Number(e.monto || 0) })),
      }))
    const { error: pErr } = await setOrdenPrecios(order.id, payload)
    if (pErr) {
      setSaving(false)
      setError(pErr)
      return
    }
    const { error: fErr } = await setOrdenFacturacion({
      orderId: order.id,
      requiere,
      incluyeIva,
      razonSocialId: requiere ? razonId : null,
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
  const conSugerencia = renglones.some((r) => rows[r.index]?.sugerido)

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
      {dirty && !readOnly && <p className="page-subtitle">Hay cambios sin guardar: guarda para ver los totales y el resumen.</p>}

      {renglones.length === 0 ? (
        <p className="page-subtitle">Esta orden todavía no tiene prendas con piezas.</p>
      ) : (
        <table className="precio-table">
          <thead>
            <tr>
              <th>Prenda</th>
              <th>Piezas</th>
              <th>Precio unitario</th>
              <th>Extras por pieza</th>
              <th style={{ textAlign: 'right' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {renglones.map((r) => {
              const row = rows[r.index] || { precio: '', extras: [] }
              const extrasPieza = row.extras.reduce((s, e) => s + (Number(e.monto) || 0), 0)
              const sub = row.precio === '' ? null : r.cantidad * ((Number(row.precio) || 0) + extrasPieza)
              return (
                <tr key={r.index}>
                  <td>
                    <strong>{r.item.garment || `Prenda ${r.index + 1}`}</strong>
                    {[r.item.color, r.item.pantone].filter(Boolean).length > 0 && (
                      <div className="razon-row__meta">{[r.item.color, r.item.pantone].filter(Boolean).join(' · ')}</div>
                    )}
                  </td>
                  <td>{r.cantidad}</td>
                  <td>
                    <input
                      type="number" min="0" step="0.01" className="input" placeholder="0.00"
                      value={row.precio} disabled={readOnly}
                      onChange={(e) => patchRow(r.index, { precio: e.target.value })}
                    />
                    {row.sugerido && <div className="precio-suggested">Sugerido: último precio de este cliente</div>}
                  </td>
                  <td>
                    <div className="precio-extras">
                      {row.extras.map((ex, i) => (
                        <div key={i} className="precio-extra">
                          <input
                            className="input" placeholder="Ej. Bordado espalda" value={ex.concepto} disabled={readOnly}
                            onChange={(e) => patchRow(r.index, { extras: row.extras.map((x, j) => (j === i ? { ...x, concepto: e.target.value } : x)) })}
                          />
                          <input
                            type="number" min="0" step="0.01" className="input" placeholder="+$" value={ex.monto} disabled={readOnly}
                            onChange={(e) => patchRow(r.index, { extras: row.extras.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)) })}
                          />
                          {!readOnly && (
                            <button type="button" className="btn btn--ghost btn--small" onClick={() => patchRow(r.index, { extras: row.extras.filter((_, j) => j !== i) })}>
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      {!readOnly && (
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => patchRow(r.index, { extras: [...row.extras, { concepto: '', monto: '' }] })}>
                          + Extra
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sub == null ? '—' : formatMxn(sub)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {conSugerencia && !readOnly && <p className="page-subtitle">Los precios sugeridos no se guardan hasta que pulses "Guardar precios y facturación".</p>}

      <div className="order-form" style={{ marginTop: 12 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={requiere} disabled={readOnly || sinCliente} onChange={(e) => handleRequiere(e.target.checked)} />
          <strong>¿Requiere factura?</strong>
        </label>
        {sinCliente && <p className="page-subtitle">Para facturar, la orden debe ser de un cliente del catálogo (esta tiene un cliente capturado a mano).</p>}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={incluyeIva} disabled={readOnly} onChange={(e) => { setIncluyeIva(e.target.checked); setDirty(true) }} />
          Los precios ya incluyen IVA <span className="page-subtitle">(si no, se les suma 16% cuando hay factura)</span>
        </label>
        {requiere && (
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
        {requiere && snapshot && !dirty && (
          <p className="razon-row__meta">
            Datos fiscales guardados en la orden: {snapshot.razon_social} · {snapshot.rfc} · {snapshot.regimen_fiscal} · CP {snapshot.cp_fiscal} · {snapshot.uso_cfdi}
          </p>
        )}
      </div>

      {!readOnly && (
        <button type="button" className="btn btn--primary" style={{ marginTop: 10 }} onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Guardando…' : 'Guardar precios y facturación'}
        </button>
      )}
      {error && <p className="form-error">{error.message}</p>}

      {totales && !dirty && (
        <>
          <div className="totales-box">
            <div className="totales-box__row"><span>Subtotal</span><span>{formatMxn(totales.subtotal)}</span></div>
            {totales.requiere_factura && <div className="totales-box__row"><span>IVA 16%</span><span>{formatMxn(totales.iva)}</span></div>}
            <div className="totales-box__row totales-box__row--total"><span>Total</span><span>{formatMxn(totales.total)}</span></div>
            <div className="totales-box__row"><span>Anticipos / abonos</span><span>− {formatMxn(totales.anticipos)}</span></div>
            <div className="totales-box__row totales-box__row--saldo"><span>Saldo pendiente</span><span>{formatMxn(totales.saldo)}</span></div>
          </div>
          {totales.lista_para_entregar ? (
            <p className="fin-ok">✓ Precios y facturación completos: la orden puede entregarse.</p>
          ) : (
            <p className="fin-missing">
              Para poder entregarla falta:{' '}
              {[
                sinPrecio.length > 0 && `precio en ${sinPrecio.map((s) => s.prenda || `prenda ${s.item_index + 1}`).join(', ')}`,
                faltantes?.falta_razon_social && 'la razón social de la factura',
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
