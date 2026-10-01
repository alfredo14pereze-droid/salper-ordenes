import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchOrdenDisenos,
  uploadOrdenDiseno,
  deleteOrdenDiseno,
  esImagenDiseno,
  DISENO_TIPO_LABELS,
  MAX_DISENO_SIZE_MB,
} from '../../services/disenosService'
import { useAuth } from '../../contexts/AuthContext'
import { canManageDisenos } from '../../utils/permissions'
import { ETAPA_ESTADO_COLORS } from '../../lib/constants'

// El diseño final va en el mismo verde de "completado" de las etapas.
const FINAL_STYLE = { background: ETAPA_ESTADO_COLORS.completado.color, color: ETAPA_ESTADO_COLORS.completado.textColor }

// V120 — diseños de la orden: propuestas (solo órdenes de sublimación) y
// diseño final (cualquier orden). Los sube/borra sublimado +
// admin_fabrica/admin_general; el resto los ve de solo lectura. Se usa
// tal cual en la vista de estación de sublimado (EstacionOrderPage.jsx) y
// en el detalle de orden de los demás roles (OrderDetailPage.jsx) — por
// eso pinta su propio contenedor (`className`) y no se muestra si no hay
// nada que ver ni que subir.
export default function OrderDisenosCard({ order, className, onChanged }) {
  const { role } = useAuth()
  const canEdit = canManageDisenos(role) && !order.eliminada_en
  const esSublimacion = order.order_type_key === 'sublimacion'
  const tipos = esSublimacion ? ['propuesta', 'final'] : ['final']

  const [disenos, setDisenos] = useState([])
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState(tipos[0])
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchOrdenDisenos(order.id)
    if (fetchError) setError(fetchError)
    else setDisenos(data || [])
    setLoading(false)
  }, [order.id])

  useEffect(() => {
    load()
  }, [load])

  async function handleSubir() {
    setSaving(true)
    setError(null)
    const { error: uploadError } = await uploadOrdenDiseno(order.id, tipo, file)
    setSaving(false)
    if (uploadError) return setError(uploadError)
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    await load()
    onChanged?.()
  }

  async function handleQuitar(diseno) {
    setSaving(true)
    setError(null)
    const { error: deleteError } = await deleteOrdenDiseno(diseno)
    setSaving(false)
    if (deleteError) return setError(deleteError)
    await load()
    onChanged?.()
  }

  if (loading) return null
  if (!canEdit && disenos.length === 0) return null

  return (
    <section className={className}>
      <h3 className="section-title section-title--small">Diseños</h3>

      {disenos.length === 0 && <p className="document-row__empty">Esta orden todavía no tiene diseños.</p>}

      {disenos.length > 0 && (
        <div className="disenos-lista">
          {disenos.map((d) => (
            <div key={d.id} className="diseno">
              <a href={d.url} target="_blank" rel="noreferrer" className="diseno__archivo">
                {esImagenDiseno(d) ? <img src={d.url} alt={d.nombre || DISENO_TIPO_LABELS[d.tipo]} loading="lazy" /> : <span>PDF</span>}
              </a>
              <span className={'badge' + (d.tipo === 'final' ? '' : ' badge--outline')} style={d.tipo === 'final' ? FINAL_STYLE : undefined}>
                {DISENO_TIPO_LABELS[d.tipo] || d.tipo}
              </span>
              {canEdit && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => handleQuitar(d)} disabled={saving}>
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="disenos-form">
          {tipos.length > 1 && (
            <div className="disenos-form__tipos">
              {tipos.map((t) => (
                <button key={t} type="button" className={'btn btn--small ' + (tipo === t ? 'btn--primary' : 'btn--secondary')} onClick={() => setTipo(t)}>
                  {DISENO_TIPO_LABELS[t]}
                </button>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="input"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <p className="form-hint">Imagen o PDF, hasta {MAX_DISENO_SIZE_MB}MB.</p>
          <button type="button" className="btn btn--primary" disabled={saving || !file} onClick={handleSubir}>
            {saving ? 'Subiendo…' : `Subir ${DISENO_TIPO_LABELS[tipo].toLowerCase()}`}
          </button>
        </div>
      )}

      {error && <p className="form-error">{error.message}</p>}
    </section>
  )
}
