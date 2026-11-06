import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Loading, ErrorState } from '../common/States'
import { canSubirOCFrisa, canSurtirFrisa, canEntregarFrisa } from '../../utils/permissions'
import { fetchSurtidoTodo } from '../../services/frisaSurtidoService'
import { conInventario, calcularUrgente } from '../../utils/frisaSurtido'
import FrisaSurtidos from './FrisaSurtidos'
import FrisaUrgente from './FrisaUrgente'

// V185 — pestañas "Órdenes de surtido" y "Urgente" (mismos datos).
export default function FrisaSurtidoSeccion({ vista }) {
  const { role } = useAuth()
  const permisos = { oc: canSubirOCFrisa(role), surtir: canSurtirFrisa(role), entregar: canEntregarFrisa(role) }
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    const { data, error: e } = await fetchSurtidoTodo()
    if (e) setError(e)
    else {
      setError(null)
      setDatos(data)
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const inv = useMemo(() => (datos ? conInventario(datos.productos, datos.surtidos, datos.lineas) : []), [datos])
  const urgente = useMemo(() => (datos ? calcularUrgente(inv, datos.surtidos, datos.lineas) : null), [datos, inv])

  if (cargando) return <Loading />
  if (error) return <div className="page"><ErrorState error={error} onRetry={recargar} /></div>

  const props = { datos, inv, urgente, permisos, recargar }
  return vista === 'urgente' ? <FrisaUrgente {...props} /> : <FrisaSurtidos {...props} />
}
