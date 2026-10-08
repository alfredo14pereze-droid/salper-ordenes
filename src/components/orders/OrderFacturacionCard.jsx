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

// V144 — datos fiscales capturados a mano (orden de un cliente no registrado).
const FISCAL_VACIO = { razon_social: '', rfc: '', regimen_fiscal: '', cp_fiscal: '', uso_cfdi: '', correo_factura: '' }
const FISCAL_OBLIGATORIOS = ['razon_social', 'rfc', 'regimen_fiscal', 'cp_fiscal', 'uso_cfdi']

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
    setFiscal(Object.fromEntries(Object.keys(FISCAL_VACIO).map((k) => [k, f.data?.fiscal_snapshot?.[k] || ''])))
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
    // Sin cliente del catálogo y con factura: datos fiscales a mano (V144).
    const { error: fErr } =
      !order.client_id && requiere
        ? await setOrdenFacturacionManual({ orderId: order.id, requiere, incluyeIva, fiscal })
        : await setOrdenFacturacion({
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
