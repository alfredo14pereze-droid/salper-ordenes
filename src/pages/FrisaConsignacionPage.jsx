import { useCallback, useEffect, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState } from '../components/common/States'
import { canViewFrisaConsignacion } from '../utils/permissions'
import { fetchFrisaTodo, cargarDatosPrueba, borrarDatosPrueba } from '../services/frisaConsignacionService'
import { generarDatosPrueba, hoyISO } from '../utils/frisaConsignacion'
import FrisaSemaforo from '../components/frisaConsignacion/FrisaSemaforo'
import FrisaPorPlanta from '../components/frisaConsignacion/FrisaPorPlanta'
import FrisaEntrega from '../components/frisaConsignacion/FrisaEntrega'
import FrisaConsumo from '../components/frisaConsignacion/FrisaConsumo'
import FrisaConfirmacion from '../components/frisaConsignacion/FrisaConfirmacion'
import FrisaHistorial from '../components/frisaConsignacion/FrisaHistorial'

// V180 — Frisa a consignación (PRUEBA de concepto, solo admin_general).
// Ver supabase/schema_v180_frisa_consignacion_prueba.sql y
// utils/frisaConsignacion.js (todos los cálculos).
const PESTANAS = [
  ['semaforo', 'Semáforo'],
  ['plantas', 'Por planta'],
  ['entrega', 'Armar entrega'],
  ['consumo', 'Consumo quincenal'],
  ['confirmacion', 'Confirmación mensual'],
  ['historial', 'Historial'],
]

export default function FrisaConsignacionPage() {
  return (
    <RequireRole allow={canViewFrisaConsignacion}>
      <FrisaContenido />
    </RequireRole>
  )
}

function FrisaContenido() {
  const [pestana, setPestana] = useState('semaforo')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState(null)

  const recargar = useCallback(async () => {
    const { data, error: e } = await fetchFrisaTodo()
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

  async function cargarPrueba() {
    setTrabajando(true)
    setAviso(null)
    const { data, error: e } = await cargarDatosPrueba(generarDatosPrueba(hoyISO()))
    setTrabajando(false)
    if (e) return setAviso({ tipo: 'error', texto: e.message })
    setAviso({ tipo: 'ok', texto: `Datos de prueba cargados: ${data.plantas} plantas, ${data.productos} SKUs, ${data.movimientos} movimientos.` })
    recargar()
  }

  async function borrarPrueba() {
    if (!window.confirm('¿Borrar TODOS los datos de prueba de Frisa (plantas, SKUs, máximos y movimientos marcados como prueba)? No se puede deshacer.')) return
    setTrabajando(true)
    setAviso(null)
    const { data, error: e } = await borrarDatosPrueba()
    setTrabajando(false)
    if (e) return setAviso({ tipo: 'error', texto: e.message })
    setAviso({ tipo: 'ok', texto: `Se borraron ${data.movimientos} movimientos, ${data.plantas} plantas y ${data.productos} SKUs de prueba.` })
    recargar()
  }

  if (cargando) return <Loading />
  if (error) return <div className="page"><ErrorState error={error} onRetry={recargar} /></div>

  const vacio = !datos.productos.length
  const props = { datos, recargar }

  return (
    <div className="page frisa">
      <div className="frisa__encabezado">
        <div>
          <h1 className="page-title">Frisa · consignación</h1>
          <p className="page-subtitle">
            Prueba de concepto: 5 plantas en Monterrey, viaje cada 10 días, consumo por quincena. Solo la ve el administrador general.
          </p>
        </div>
        <div className="frisa__prueba-botones">
          <button type="button" className="btn btn--secondary btn--small" disabled={trabajando} onClick={cargarPrueba}>
            Cargar datos de prueba
          </button>
          <button type="button" className="btn btn--ghost btn--small" disabled={trabajando} onClick={borrarPrueba}>
            Borrar datos de prueba
          </button>
        </div>
      </div>

      {aviso && <p className={aviso.tipo === 'error' ? 'form-error' : 'frisa__ok'}>{aviso.texto}</p>}

      {vacio ? (
        <div className="card frisa__vacio">
          <p>Todavía no hay plantas ni SKUs. Toca <strong>Cargar datos de prueba</strong> para llenar 3 meses de ejemplo.</p>
        </div>
      ) : (
        <>
          <div className="notas-pestanas frisa__pestanas" role="tablist">
            {PESTANAS.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={pestana === k}
                className={'notas-pestana' + (pestana === k ? ' notas-pestana--activa' : '')} onClick={() => { setPestana(k); setAviso(null) }}>
                {label}
              </button>
            ))}
          </div>
          {pestana === 'semaforo' && <FrisaSemaforo {...props} />}
          {pestana === 'plantas' && <FrisaPorPlanta {...props} />}
          {pestana === 'entrega' && <FrisaEntrega {...props} />}
          {pestana === 'consumo' && <FrisaConsumo {...props} />}
          {pestana === 'confirmacion' && <FrisaConfirmacion {...props} />}
          {pestana === 'historial' && <FrisaHistorial {...props} />}
        </>
      )}
    </div>
  )
}
