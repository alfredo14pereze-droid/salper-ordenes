import { pdf } from '@react-pdf/renderer'
import PendientesFabricaPdf from '../components/pdf/PendientesFabricaPdf'
import { getStatusLabel } from './status'
import { pendientesDeEntrega, sinEmpezar } from './reportePendientes'

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const generadoTexto = () => new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })

// tipo: 'entrega' (pendientes de entrega) o 'sin_empezar' (necesita `etapas`).
export async function buildPendientesPdfBlob(tipo, { orders, etapas = [], typesByKey = {} }) {
  const tipos = Object.fromEntries(Object.entries(typesByKey).map(([k, t]) => [k, t?.label || k]))
  const esSinEmpezar = tipo === 'sin_empezar'
  const lista = esSinEmpezar ? sinEmpezar(orders, etapas) : pendientesDeEntrega(orders)
  const props = {
    titulo: esSinEmpezar ? 'Órdenes sin empezar' : 'Pendientes de entrega',
    nota: esSinEmpezar
      ? 'Sin entregar y sin ningún proceso empezado (corte, costura, sublimado, bordado, terminado…).'
      : 'Todas las órdenes que todavía no se entregan al cliente (sin canceladas).',
    orders: lista,
    tipos,
    estado: getStatusLabel,
    hoy: hoyLocal(),
    generado: generadoTexto(),
  }
  return pdf(<PendientesFabricaPdf {...props} />).toBlob()
}

export const pendientesPdfFileName = (tipo) => `SALPER-${tipo === 'sin_empezar' ? 'sin-empezar' : 'pendientes-entrega'}-${hoyLocal()}.pdf`
