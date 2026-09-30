import { useCallback, useEffect, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { canGestionarConsumosPrenda } from '../utils/permissions'
import { Loading, ErrorState } from '../components/common/States'
import {
  fetchConsumosPrenda,
  guardarConsumoPrenda,
  eliminarConsumoPrenda,
  fetchPrendasConocidas,
} from '../services/consumosPrendaService'

// V101 — Consumos por prenda (rendimientos de tela). Exclusivo
// admin_fabrica/admin_general. Tabla editable + import de CSV con
// vista previa de errores antes de guardar nada.
export default function ConsumosPrendaPage() {
  return (
    <RequireRole allow={canGestionarConsumosPrenda}>
      <ConsumosPrendaContent />
    </RequireRole>
  )
}

function tallasTexto(tallas) {
  return tallas && tallas.length > 0 ? tallas.join(', ') : 'Promedio general'
}

function parseTallasInput(text) {
  const arr = text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  return arr.length > 0 ? arr : null
}

const VACIO = { id: null, prenda: '', tallasTexto: '', consumo: '', unidad: 'metro' }

function ConsumoForm({ form, setForm, onSaved, onCancel }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error: err } = await guardarConsumoPrenda({
      id: form.id,
      prenda: form.prenda.trim(),
      tallas: parseTallasInput(form.tallasTexto),
      consumo: Number(form.consumo),
      unidad: form.unidad,
    })
    setSaving(false)
    if (err) return setError(err)
    onSaved()
  }

  return (
    <form className="order-form card" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
      <h3 className="section-title section-title--small">{form.id ? 'Editar consumo' : 'Nuevo consumo'}</h3>
      <label>
        Prenda
        <input className="input" value={form.prenda} onChange={(e) => setForm({ ...form, prenda: e.target.value })} placeholder="Ej. Playera" required />
      </label>
      <label>
        Tallas (separadas por coma — vacío = promedio general de la prenda)
        <input className="input" value={form.tallasTexto} onChange={(e) => setForm({ ...form, tallasTexto: e.target.value })} placeholder="Ej. 4, 6, 8" />
      </label>
      <div className="form-row">
        <label>
          Consumo
          <input className="input" type="number" min="0.01" step="0.01" value={form.consumo} onChange={(e) => setForm({ ...form, consumo: e.target.value })} required />
        </label>
        <label>
          Unidad
          <select className="input" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })}>
            <option value="metro">Metro</option>
            <option value="kilo">Kilo</option>
          </select>
        </label>
      </div>
      {error && <p className="form-error">{error.message}</p>}
      <div className="order-form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving || !form.prenda.trim() || !form.consumo}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

function ConsumoRow({ item, onEdit, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleDelete() {
    setBusy(true)
    setError(null)
    const { error: err } = await eliminarConsumoPrenda(item.id)
    setBusy(false)
    if (err) return setError(err)
    onDeleted()
  }

  return (
    <tr>
      <td>{item.prenda}</td>
      <td>{tallasTexto(item.tallas)}</td>
      <td>{item.consumo}</td>
      <td>{item.unidad}</td>
      <td style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => onEdit(item)}>
          Editar
        </button>
        {!confirming ? (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setConfirming(true)}>
            Eliminar
          </button>
        ) : (
          <>
            <button type="button" className="btn btn--small btn--ghost" style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }} onClick={handleDelete} disabled={busy}>
              {busy ? '…' : '¿Seguro?'}
            </button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancelar
            </button>
          </>
        )}
        {error && <span className="form-error">{error.message}</span>}
      </td>
    </tr>
  )
}

// --- Import de CSV -----------------------------------------------------
// Formato manual (sin librería nueva): 4 columnas, con encabezado —
// prenda,tallas,consumo,unidad. tallas separadas por "|" dentro del CSV
// (una coma ya separa columnas), vacío = promedio general.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((f) => f.trim() !== '')) rows.push(row)
  }
  return rows
}

function ImportCsv({ existentes, onImported }) {
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [resultado, setResultado] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    const rows = parseCsv(text)
    const dataRows = rows.slice(1) // primera fila = encabezado

    const { data: conocidas } = await fetchPrendasConocidas()
    const prendasConocidas = new Set((conocidas || []).map((r) => r.garment.toLowerCase().trim()))

    // arreglos de tallas ya ocupadas por prenda (de lo ya guardado en BD)
    const tallasExistentesPorPrenda = new Map()
    const promedioExistente = new Set()
    for (const c of existentes) {
      const norm = c.prenda.toLowerCase().trim()
      if (!c.tallas) {
        promedioExistente.add(norm)
      } else {
        const set = tallasExistentesPorPrenda.get(norm) || new Set()
        c.tallas.forEach((t) => set.add(t))
        tallasExistentesPorPrenda.set(norm, set)
      }
    }
    // para detectar traslapes DENTRO del mismo archivo también
    const promedioEnLote = new Set()
    const tallasEnLotePorPrenda = new Map()

    const items = dataRows.map((cols, i) => {
      const prenda = (cols[0] || '').trim()
      const tallasTexto = (cols[1] || '').trim()
      const consumoTexto = (cols[2] || '').trim()
      const unidadTexto = (cols[3] || '').trim().toLowerCase()
      const errores = []
      const avisos = []

      if (!prenda) errores.push('Falta la prenda.')
      const norm = prenda.toLowerCase().trim()
      const tallas = tallasTexto ? tallasTexto.split('|').map((t) => t.trim()).filter(Boolean) : null

      const consumo = Number(consumoTexto)
      if (!consumoTexto || Number.isNaN(consumo) || consumo <= 0) errores.push('Consumo inválido (debe ser un número mayor a 0).')

      if (unidadTexto !== 'metro' && unidadTexto !== 'kilo') errores.push(`Unidad inválida: "${unidadTexto}". Debe ser metro o kilo.`)

      if (prenda && norm && prendasConocidas.size > 0 && !prendasConocidas.has(norm)) {
        avisos.push('Esta prenda no aparece en ninguna orden capturada todavía — revisa que el nombre esté bien escrito.')
      }

      if (prenda) {
        if (!tallas) {
          if (promedioExistente.has(norm) || promedioEnLote.has(norm)) {
            errores.push('Ya existe un promedio general para esta prenda.')
          } else {
            promedioEnLote.add(norm)
          }
        } else {
          const yaOcupadas = tallasExistentesPorPrenda.get(norm) || new Set()
          const enLote = tallasEnLotePorPrenda.get(norm) || new Set()
          const choque = tallas.filter((t) => yaOcupadas.has(t) || enLote.has(t))
          if (choque.length > 0) {
            errores.push(`Talla(s) ya definida(s) para esta prenda: ${choque.join(', ')}.`)
          } else {
            tallas.forEach((t) => enLote.add(t))
            tallasEnLotePorPrenda.set(norm, enLote)
          }
        }
      }

      return { fila: i + 2, prenda, tallas, consumo, unidad: unidadTexto, errores, avisos }
    })

    setPreview(items)
    setResultado(null)
  }

  async function confirmarImport() {
    if (!preview) return
    setImporting(true)
    let ok = 0
    let fail = 0
    for (const item of preview) {
      if (item.errores.length > 0) continue
      const { error } = await guardarConsumoPrenda({ id: null, prenda: item.prenda, tallas: item.tallas, consumo: item.consumo, unidad: item.unidad })
      if (error) fail++
      else ok++
    }
    setImporting(false)
    setResultado({ ok, fail })
    setPreview(null)
    onImported()
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 className="section-title section-title--small">Importar desde CSV</h3>
      <p className="form-hint">
        Columnas: prenda, tallas (varias separadas por " | ", vacío = promedio general), consumo, unidad. Primera fila = encabezado.
      </p>
      <input type="file" accept=".csv,text/csv" className="input" onChange={handleFile} />
      {resultado && (
        <p className="form-hint" style={{ marginTop: 8 }}>
          Importados: {resultado.ok}. Con error (no importados): {resultado.fail}.
        </p>
      )}
      {preview && (
        <div style={{ marginTop: 12 }}>
          <div className="revision__tabla-wrap">
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Prenda</th>
                  <th>Tallas</th>
                  <th>Consumo</th>
                  <th>Unidad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((item) => (
                  <tr key={item.fila}>
                    <td>{item.fila}</td>
                    <td>{item.prenda || '—'}</td>
                    <td>{tallasTexto(item.tallas)}</td>
                    <td>{item.consumo}</td>
                    <td>{item.unidad}</td>
                    <td>
                      {item.errores.length > 0 && <span className="form-error">{item.errores.join(' ')}</span>}
                      {item.errores.length === 0 && item.avisos.length > 0 && <span style={{ color: 'var(--color-warning)' }}>{item.avisos.join(' ')}</span>}
                      {item.errores.length === 0 && item.avisos.length === 0 && 'Ok'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="order-form__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setPreview(null)} disabled={importing}>
              Cancelar
            </button>
            <button type="button" className="btn btn--primary" onClick={confirmarImport} disabled={importing || preview.every((i) => i.errores.length > 0)}>
              {importing ? 'Importando…' : `Confirmar importación (${preview.filter((i) => i.errores.length === 0).length} válidas)`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ConsumosPrendaContent() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null)

  const load = useCallback(async () => {
    const { data, error: err } = await fetchConsumosPrenda()
    if (err) setError(err)
    else {
      setItems(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="page page--narrow">
      <h2 className="section-title">Consumos por prenda</h2>
      <p className="page-subtitle">
        Cuánta tela usa cada prenda (por talla, o un promedio general). Con esto se calcula el consumo estimado y el
        comprometido de cada tela en las órdenes.
      </p>

      {!form && (
        <button type="button" className="btn btn--secondary btn--small" style={{ marginBottom: 16 }} onClick={() => setForm({ ...VACIO })}>
          + Nuevo consumo
        </button>
      )}
      {form && (
        <ConsumoForm
          form={form}
          setForm={setForm}
          onCancel={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            load()
          }}
        />
      )}

      <ImportCsv existentes={items} onImported={load} />

      <div className="card">
        {loading && <Loading label="Cargando…" />}
        {error && <ErrorState error={error} onRetry={load} />}
        {!loading && !error && items.length === 0 && <p className="page-subtitle">No hay consumos registrados todavía.</p>}
        {!loading && !error && items.length > 0 && (
          <div className="revision__tabla-wrap">
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Prenda</th>
                  <th>Tallas</th>
                  <th>Consumo</th>
                  <th>Unidad</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <ConsumoRow
                    key={item.id}
                    item={item}
                    onEdit={(i) => setForm({ id: i.id, prenda: i.prenda, tallasTexto: (i.tallas || []).join(', '), consumo: i.consumo, unidad: i.unidad })}
                    onDeleted={load}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
