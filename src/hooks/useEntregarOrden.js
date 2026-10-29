import { useState } from 'react'
import { entregarOrden } from '../services/ordersService'
import { useAuth } from '../contexts/AuthContext'
import { canForceDelivery } from '../utils/permissions'

// "Confirmar entrega al cliente" (entregar_orden, V160) con su flujo completo:
// confirmar → entregar; si se bloquea por precio/factura y hay permiso, deja
// escribir un motivo para entregar de todos modos (queda registrado).
// Lo usan StatusChanger y EntregaRapida (detalle y tarjetas de la lista).
export function useEntregarOrden(order, onEntregada) {
  const { role } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [bloqueo, setBloqueo] = useState(null)
  const [motivo, setMotivo] = useState('')

  async function entregar() {
    const folio = order.order_number ? ` #${order.order_number}` : ''
    if (!window.confirm(`¿Confirmas que la orden${folio} ya se entregó al cliente? Pasará a Órdenes pasadas.`)) return
    setSaving(true)
    setError(null)
    setBloqueo(null)
    const { error: entregaError } = await entregarOrden(order.id)
    setSaving(false)
    if (entregaError) {
      if (/^No se puede marcar como entregada/.test(entregaError.message) && canForceDelivery(role)) {
        setBloqueo(entregaError.message)
        setMotivo('')
      } else {
        setError(entregaError)
      }
      return
    }
    onEntregada?.()
  }

  async function forzar() {
    if (motivo.trim().length < 5) {
      setError(new Error('Escribe el motivo para entregar de todos modos.'))
      return
    }
    setSaving(true)
    setError(null)
    const { error: entregaError } = await entregarOrden(order.id, { forzar: true, motivo: motivo.trim() })
    setSaving(false)
    if (entregaError) {
      setError(entregaError)
      return
    }
    setBloqueo(null)
    onEntregada?.()
  }

  return { saving, error, bloqueo, motivo, setMotivo, entregar, forzar, cancelarBloqueo: () => setBloqueo(null) }
}
