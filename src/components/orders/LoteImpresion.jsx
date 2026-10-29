import { useCallback, useEffect, useState } from 'react'
import Modal from '../talleros/Modal'
import { corregirLoteImpresion, fetchLotesImpresion, imprimirLote } from '../../services/ordersService'
import { TINTAS, formatMl, numero, totalTinta, validarReporteImpresion } from '../../utils/impresionReporte'
import { ordenesDelLote, reporteDeLote, telasDeOrden } from '../../utils/loteImpresion'
import { formatDateTime } from '../../utils/dates'
import { Loading, ErrorState, EmptyState } from '../common/States'

// V167 — impresión por lote (Samuel). El programa de impresión da un solo
// total para todo el trazo: se captura una vez y se guarda en el lote
// (lotes_impresion). Ver schema_v167_lotes_impresion.sql.

const vacio = () => ({ largo: '', ...Object.fromEntries(TINTAS.map((t) => [t.key, ''])), notas: '' })
const desdeLote = (lote) => {
  const r = reporteDeLote(lote)
  return { largo: String(r.largo), ...Object.fromEntries(TINTAS.map((t) => [t.key, String(r[t.key])])), notas: lote.notas || '' }
}
const aNumeros = (v) => ({ largo: numero(v.largo), ...Object.fromEntries(TINTAS.map((t) => [t.key, numero(v[t.key])])), notas: v.notas.trim() })

// Largo, tinta por color, total y notas (mismos campos que el reporte por orden).
function CamposTrazoTinta({ v, set }) {
  return (
    <>
      <label>
        Largo total del trazo (metros)
        <input type="text" inputMode="decimal" className="input" value={v.largo} onChange={(e) => set('largo', e.target.value)} placeholder="0.00" />
      </label>
      <span className="field-label" style={{ display: 'block', marginTop: 10 }}>
        Consumo de tinta del lote (mL)
      </span>
      <div className="impresion-reporte__tintas">
        {TINTAS.map((t) => (
          <label key={t.key}>
            {t.label}
            <input type="text" inputMode="decimal" className="input" value={v[t.key]} onChange={(e) => set(t.key, e.target.value)} placeholder="0.000" />
          </label>
        ))}
      </div>
      <div className="impresion-reporte__total impresion-reporte__total--form">
        <span>Total de tinta</span>
        <b>{formatMl(totalTinta(v))}</b>
      </div>
      <label>
        Notas (opcional)
        <input type="text" className="input" value={v.notas} onChange={(e) => set('notas', e.target.value)} placeholder="Papel, perfil, algo que pasó…" />
      </label>
    </>
  )
}

function useCampos(inicial) {
  const [v, setV] = useState(inicial)
  const [error, setError] = useState(null)
  const set = (campo, valor) => {
    setError(null)
    setV((prev) => ({ ...prev, [campo]: valor }))
  }
  return { v, set, error, setError }
}

// Captura del lote: las órdenes elegidas (con su tela) y los totales.
export function LoteImpresionModal({ ordenes, onClose, onGuardado }) {
  const { v, set, error, setError } = useCampos(vacio)
  const [saving, setSaving] = useState(false)

  async function guardar() {
    const falta = validarReporteImpresion(v)
    if (falta) return setError(new Error(falta))
    setSaving(true)
    setError(null)
    const { data, error: err } = await imprimirLote(
      ordenes.map((o) => o.id),
      aNumeros(v)
    )
    setSaving(false)
    if (err) return setError(err)
    onGuardado(data)
  }

  const n = ordenes.length
  return (
    <Modal title={`Imprimir lote · ${n} ${n === 1 ? 'orden' : 'órdenes'}`} onClose={saving ? () => {} : onClose}>
      <div className="impresion-reporte">
        <ul className="lote-ordenes">
          {ordenes.map((o) => {
            const telas = telasDeOrden(o)
            return (
              <li key={o.id}>
                <b>#{o.order_number}</b> {o.client_name}
                {telas.length > 0 && <span className="lote-ordenes__tela">Tela: {telas.join(' · ')}</span>}
              </li>
            )
          })}
        </ul>
        <CamposTrazoTinta v={v} set={set} />
        {error && <p className="form-error">{error.message}</p>}
        <button type="button" className="btn estacion-btn estacion-btn--iniciar" disabled={saving} onClick={guardar}>
          {saving ? 'Guardando…' : `Marcar ${n === 1 ? 'impresa' : `${n} impresas`}`}
        </button>
        <button type="button" className="btn btn--ghost btn--small" disabled={saving} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  )
}

// Reporte de un lote: órdenes con su tela, metros y tinta. Se puede
// imprimir y corregir.
export function LoteReporte({ lote, orders, puedeCorregir, onCorregido }) {
  const [editando, setEditando] = useState(false)
  const { v, set, error, setError } = useCampos(() => desdeLote(lote))
  const [saving, setSaving] = useState(false)
  const r = reporteDeLote(lote)
  const lista = ordenesDelLote(lote, orders)

  async function guardar() {
    const falta = validarReporteImpresion(v)
    if (falta) return setError(new Error(falta))
    setSaving(true)
    const { data, error: err } = await corregirLoteImpresion(lote.id, aNumeros(v))
    setSaving(false)
    if (err) return setError(err)
    setEditando(false)
    onCorregido?.(data)
  }

  function imprimir() {
    document.body.classList.add('imprime-lote')
    const quitar = () => {
      document.body.classList.remove('imprime-lote')
      window.removeEventListener('afterprint', quitar)
    }
    window.addEventListener('afterprint', quitar)
    window.print()
  }

  return (
    <div className="lote-reporte">
      <h3 className="lote-reporte__titulo">Lote de impresión · {formatDateTime(lote.creado_en)}</h3>
      <p className="pantone-hint">
        {lote.creado_por_nombre ? `Imprimió ${lote.creado_por_nombre}` : 'Lote de impresión'} · {lista.length} {lista.length === 1 ? 'orden' : 'órdenes'}
        {lote.corregido_en ? ` · corregido ${formatDateTime(lote.corregido_en)}${lote.corregido_por_nombre ? ` por ${lote.corregido_por_nombre}` : ''}` : ''}
      </p>
      <table className="lote-reporte__tabla">
        <thead>
          <tr>
            <th>Folio</th>
            <th>Cliente</th>
            <th>Tela</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((o) => (
            <tr key={o.id}>
              <td>#{o.folio}</td>
              <td>{o.cliente || '—'}</td>
              <td>{o.telas.join(' · ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {editando ? (
        <div className="impresion-reporte">
          <CamposTrazoTinta v={v} set={set} />
          {error && <p className="form-error">{error.message}</p>}
          <button type="button" className="btn estacion-btn estacion-btn--iniciar" disabled={saving} onClick={guardar}>
            {saving ? 'Guardando…' : 'Guardar corrección'}
          </button>
          <button type="button" className="btn btn--ghost btn--small" disabled={saving} onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <>
          <dl className="impresion-reporte__datos">
            <div>
              <dt>Largo total del trazo</dt>
              <dd>{r.largo} m</dd>
            </div>
            {TINTAS.map((t) => (
              <div key={t.key}>
                <dt>{t.label}</dt>
                <dd>{formatMl(r[t.key])}</dd>
              </div>
            ))}
            <div className="impresion-reporte__total">
              <dt>Total de tinta</dt>
              <dd>{formatMl(r.total)}</dd>
            </div>
          </dl>
          {lote.notas && <p className="lote-reporte__notas">Notas: {lote.notas}</p>}
          <div className="lote-reporte__acciones">
            <button type="button" className="btn btn--secondary btn--small" onClick={imprimir}>
              Imprimir reporte
            </button>
            {puedeCorregir && (
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditando(true)}>
                Corregir números
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Pestaña "Lotes": los lotes guardados, el más reciente primero; al tocar
// uno se abre su reporte.
export function LotesImpresionLista({ orders, puedeCorregir, recargar }) {
  const [lotes, setLotes] = useState(null)
  const [error, setError] = useState(null)
  const [abierto, setAbierto] = useState(null)

  const load = useCallback(async () => {
    const { data, error: err } = await fetchLotesImpresion()
    if (err) return setError(err)
    setError(null)
    setLotes(data || [])
  }, [])

  useEffect(() => {
    load()
  }, [load, recargar])

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!lotes) return <Loading label="Cargando lotes…" />
  if (lotes.length === 0) return <EmptyState>Todavía no hay lotes de impresión.</EmptyState>

  return (
    <div className="estacion-list">
      {lotes.map((l) => {
        const r = reporteDeLote(l)
        const n = l.order_ids?.length || 0
        return (
          <div key={l.id} className="estacion-card lote-card">
            <button type="button" className="lote-card__head" aria-expanded={abierto === l.id} onClick={() => setAbierto(abierto === l.id ? null : l.id)}>
              <span className="estacion-card__folio">{formatDateTime(l.creado_en)}</span>
              <span className="estacion-card__prendas">
                {n} {n === 1 ? 'orden' : 'órdenes'}: {(l.folios || []).map((f) => `#${f}`).join(', ')}
              </span>
              <span className="estacion-card__chips">
                <span className="badge">{r.largo} m</span>
                <span className="badge">{formatMl(r.total)}</span>
                {l.creado_por_nombre && <span className="badge">{l.creado_por_nombre}</span>}
              </span>
            </button>
            {abierto === l.id && (
              <LoteReporte
                lote={l}
                orders={orders}
                puedeCorregir={puedeCorregir}
                onCorregido={(nuevo) => setLotes((prev) => prev.map((x) => (x.id === nuevo.id ? nuevo : x)))}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
