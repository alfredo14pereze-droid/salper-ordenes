import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { canVerOperacionesProduccion, canViewProduccionMontos } from '../utils/permissions'
import { useAuth } from '../contexts/AuthContext'
import HojaOperacionesPrenda from '../components/impresion/HojaOperacionesPrenda'
import { fetchCotizacionGuardada } from '../services/cotizacionesService'
import { fetchHojaImpresa } from '../services/hojasImpresasService'

// Hoja de impresión de las operaciones de una prenda (?prenda=...). La ven los
// mismos que ven el catálogo de operaciones; no trae montos.
// V172 — o de una cotización guardada (?cotizacion=id): solo sus operaciones.
// V173 — o de una hoja ya impresa (?hoja=id): sus operaciones y su título.
export default function ImprimirOperacionesPage() {
  const [params] = useSearchParams()
  const { role } = useAuth()
  const prenda = params.get('prenda') || ''
  const cotizacionId = params.get('cotizacion') || ''
  const hojaId = params.get('hoja') || ''
  const volverA = canViewProduccionMontos(role) ? '/produccion/admin' : '/produccion/operaciones'
  return (
    <RequireRole allow={canVerOperacionesProduccion}>
      {hojaId ? (
        <HojaGuardada id={hojaId} volverA={volverA} />
      ) : cotizacionId ? (
        <HojaDeCotizacion id={cotizacionId} />
      ) : prenda ? (
        <HojaOperacionesPrenda prenda={prenda} volverA={volverA} />
      ) : (
        <p className="page">Falta elegir la prenda.</p>
      )}
    </RequireRole>
  )
}

function HojaDeCotizacion({ id }) {
  const [c, setC] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    fetchCotizacionGuardada(id).then(({ data, error: err }) => {
      if (err) setError(err.message)
      else if (!data) setError('No encuentro esa cotización.')
      else setC(data)
    })
  }, [id])
  if (error) return <p className="page form-error">{error}</p>
  if (!c) return <p className="page template-hint">Cargando cotización…</p>
  return <HojaOperacionesPrenda prenda={c.prenda} volverA="/cotizador" operaciones={c.operaciones} tituloInicial={c.nombre} />
}

function HojaGuardada({ id, volverA }) {
  const [h, setH] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    fetchHojaImpresa(id).then(({ data, error: err }) => {
      if (err) setError(err.message)
      else if (!data) setError('No encuentro esa hoja.')
      else setH(data)
    })
  }, [id])
  if (error) return <p className="page form-error">{error}</p>
  if (!h) return <p className="page template-hint">Cargando hoja…</p>
  return <HojaOperacionesPrenda prenda={h.prenda} volverA={volverA} operaciones={h.operaciones} tituloInicial={h.titulo} />
}
