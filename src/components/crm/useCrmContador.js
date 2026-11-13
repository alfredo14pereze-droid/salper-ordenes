import { useCallback, useEffect, useState } from 'react'
import { contarMisPendientes } from '../../services/crmService'
import { EVENTO_SEGUIMIENTOS, hoyMonterrey } from '../../utils/crm'

// Parte 2 — número junto a "CRM" en el menú: seguimientos vencidos + de hoy
// asignados al usuario. Se calcula al entrar a la app, al volver a la pestaña
// y cada vez que alguien registra/completa un seguimiento (EVENTO_SEGUIMIENTOS).
// userId null = no tiene CRM (no consulta nada).
export default function useCrmContador(userId) {
  const [n, setN] = useState(0)
  const contar = useCallback(async () => {
    if (!userId) return setN(0)
    const { data, error } = await contarMisPendientes(userId, hoyMonterrey())
    if (!error) setN(data || 0)
  }, [userId])

  useEffect(() => {
    contar()
    const alVolver = () => document.visibilityState === 'visible' && contar()
    window.addEventListener(EVENTO_SEGUIMIENTOS, contar)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.removeEventListener(EVENTO_SEGUIMIENTOS, contar)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [contar])
  return n
}
