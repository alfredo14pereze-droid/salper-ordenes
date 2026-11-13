import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { fetchCrmUsuarios } from '../../services/crmService'
import { ESTATUS_POR_KEY, estatusLabel } from '../../utils/crm'

export function EstatusBadge({ estatus }) {
  const e = ESTATUS_POR_KEY[estatus]
  return (
    <span className="crm-badge" style={e ? { background: e.bg, color: e.fg } : undefined}>
      {estatusLabel(estatus)}
    </span>
  )
}

// Personas que pueden llevar prospectos. Sin la función crm_usuarios (V208)
// solo se conoce al usuario actual.
export function useCrmUsuarios() {
  const { user, profile } = useAuth()
  const [lista, setLista] = useState([])
  useEffect(() => {
    let vivo = true
    fetchCrmUsuarios().then(({ data }) => vivo && setLista(data || []))
    return () => {
      vivo = false
    }
  }, [])
  return useMemo(() => {
    const m = new Map(lista.map((u) => [u.id, u.nombre]))
    if (user?.id && !m.has(user.id)) m.set(user.id, profile?.full_name || 'Yo')
    const opciones = [...m.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    return { opciones, nombre: (id) => (id ? m.get(id) || 'Otra persona' : '—') }
  }, [lista, user, profile])
}

// Liga para llamar / escribir / WhatsApp.
export function telLink(tel) {
  const d = String(tel || '').replace(/[^\d+]/g, '')
  return d ? `tel:${d}` : null
}
export function waLink(tel) {
  let d = String(tel || '').replace(/\D/g, '')
  if (!d) return null
  if (d.length === 10) d = '52' + d // número de México sin lada de país
  return `https://wa.me/${d}`
}
