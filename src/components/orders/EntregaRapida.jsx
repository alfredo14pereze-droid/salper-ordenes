import { useAuth } from '../../contexts/AuthContext'
import { useEntregarOrden } from '../../hooks/useEntregarOrden'
import { canDeliverOrder } from '../../utils/permissions'

// ¿Se muestra el atajo de entrega? Solo órdenes "Lista para entregar"
// (terminado), vivas, y para quien tenga el permiso orden.entregar.
export function puedeEntregaRapida(role, user, order) {
  return !!user && order.status === 'terminado' && !order.cancelled_at && !order.eliminada_en && canDeliverOrder(role)
}

// Botón "Confirmar entrega al cliente" para órdenes listas.
// variante="banner": recuadro verde arriba del detalle de la orden.
// variante="tarjeta": dentro de la tarjeta de la lista (no abre la orden al tocarlo).
export default function EntregaRapida({ order, onEntregada, variante = 'banner' }) {
  const { role, user } = useAuth()
  const e = useEntregarOrden(order, onEntregada)
  if (!puedeEntregaRapida(role, user, order)) return null

  const enTarjeta = variante === 'tarjeta'
  const detener = (ev) => ev.stopPropagation()

  return (
    <div
      className={`entrega-rapida entrega-rapida--${variante}`}
      onClick={enTarjeta ? detener : undefined}
      onKeyDown={enTarjeta ? detener : undefined}
    >
      <div className="entrega-rapida__fila">
        {!enTarjeta && <p className="entrega-rapida__texto">✓ Lista para entregar. Cuando el cliente la reciba, confírmalo aquí.</p>}
        <button type="button" className="btn btn--primary entrega-rapida__btn" disabled={e.saving} onClick={e.entregar}>
          {e.saving ? 'Guardando…' : 'Confirmar entrega al cliente'}
        </button>
      </div>

      {e.bloqueo && (
        <div className="entrega-forzar">
          <p className="fin-missing" style={{ marginTop: 0 }}>{e.bloqueo}</p>
          <label className="entrega-forzar__motivo">
            Si de todos modos ya se entregó, escribe el motivo (queda registrado con tu nombre):
            <textarea
              className="input"
              rows={2}
              value={e.motivo}
              onChange={(ev) => e.setMotivo(ev.target.value)}
              placeholder="Ej. El cliente pagó en efectivo; el precio se captura después."
            />
          </label>
          <div className="entrega-rapida__fila">
            <button type="button" className="btn btn--primary" disabled={e.saving || e.motivo.trim().length < 5} onClick={e.forzar}>
              {e.saving ? 'Guardando…' : 'Entregar de todos modos'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={e.saving} onClick={e.cancelarBloqueo}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {e.error && <p className="form-error">{e.error.message}</p>}
    </div>
  )
}
