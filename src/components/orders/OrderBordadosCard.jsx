import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchOrdenBordados, createOrdenBordado, deleteOrdenBordado } from '../../services/bordadosService'
import { useAuth } from '../../contexts/AuthContext'
import { canManageBordado } from '../../utils/permissions'

const UBICACIONES = ['Frente', 'Espalda', 'Manga izquierda', 'Manga derecha', 'Otro']

// Una prenda a la vez: sus registros existentes (ubicación + foto) y, si
// el rol califica, un formulario inline para agregar uno más.
function PrendaBordadoRow({ orderId, item, registros, canEdit, onChanged }) {
  const [adding, setAdding] = useState(false)
  const [ubicacion, setUbicacion] = useState(UBICACIONES[0])
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  async function handleAdd() {
    setSaving(true)
    setError(null)
    const { error: createError } = await createOrdenBordado(orderId, item.id, ubicacion, file)
    setSaving(false)
    if (createError) {
      setError(createError)
      return
    }
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setAdding(false)
    onChanged?.()
  }

  async function handleDelete(registro) {
    setSaving(true)
    setError(null)
    const { error: deleteError } = await deleteOrdenBordado(registro)
    setSaving(false)
    if (deleteError) {
      setError(deleteError)
      return
    }
    onChanged?.()
  }

  return (
    <div className="document-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <span className="document-row__label">{item.garment || 'Prenda sin nombre'}</span>

      {registros.length === 0 && <p className="document-row__empty">Sin registros de bordado todavía.</p>}

      {registros.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {registros.map((r) => (
            <div key={r.id} style={{ textAlign: 'center' }}>
              {r.foto_url && (
                <img
                  src={r.foto_url}
                  alt={r.ubicacion}
                  style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                />
              )}
              <span className="pending-card__garment" style={{ display: 'block', marginTop: 2 }}>
                {r.ubicacion}
              </span>
              {canEdit && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => handleDelete(r)} disabled={saving}>
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && !adding && (
        <button type="button" className="btn btn--secondary btn--small" onClick={() => setAdding(true)} style={{ alignSelf: 'flex-start' }}>
          + Agregar bordado
        </button>
      )}

      {canEdit && adding && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select className="input" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} style={{ maxWidth: 180 }}>
            {UBICACIONES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button type="button" className="btn btn--primary btn--small" onClick={handleAdd} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setAdding(false)} disabled={saving}>
            Cancelar
          </button>
        </div>
      )}

      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}

// Bordado condicional POR PRENDA (V25, ver
// supabase/schema_v25_bordado_condicional.sql): solo se muestra si al
// menos una prenda de la orden tiene lleva_bordado=true. Cada prenda con
// bordado lista sus propios registros (ubicación + foto) — subir/borrar
// es exclusivo de bordado/admin_fabrica/admin_general (canManageBordado);
// ventas/admin_tienda deciden QUÉ prenda lleva bordado desde
// OrderItemsEditor, no aquí.
export default function OrderBordadosCard({ order, onUpdated }) {
  const { role } = useAuth()
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)

  const prendasConBordado = (order.items || []).filter((it) => it.lleva_bordado)

  const load = useCallback(async () => {
    const { data } = await fetchOrdenBordados(order.id)
    setRegistros(data || [])
    setLoading(false)
  }, [order.id])

  useEffect(() => {
    load()
  }, [load])

  if (prendasConBordado.length === 0) return null
  if (loading) return null

  const canEdit = canManageBordado(role)

  return (
    <div>
      <h3 className="section-title section-title--small">Bordado</h3>
      <p className="page-subtitle" style={{ marginTop: -6, marginBottom: 10 }}>
        Ubicación y foto por prenda que lleva bordado.
      </p>
      <div className="document-list">
        {prendasConBordado.map((item, idx) => (
          <PrendaBordadoRow
            key={item.id || idx}
            orderId={order.id}
            item={item}
            registros={registros.filter((r) => r.item_id === item.id)}
            canEdit={canEdit}
            onChanged={() => {
              load()
              onUpdated?.()
            }}
          />
        ))}
      </div>
    </div>
  )
}
