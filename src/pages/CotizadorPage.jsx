import { useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { canUsarCotizador } from '../utils/permissions'
import Cotizador from '../components/cotizador/Cotizador'
import CotizacionesGuardadas from '../components/cotizador/CotizacionesGuardadas'
import CotizarDesdeHoja from '../components/cotizador/CotizarDesdeHoja'
import { esCotizacionDeHoja } from '../utils/cotizarHoja'

// Cotizador de destajo por prenda (solo admin_general y admin_fabrica).
// V172 — pestaña "Guardadas" con las cotizaciones que se guardaron.
// V191 — en "Cotizar" se escoge: por prenda (marcar operaciones) o subiendo
// la foto/PDF de una hoja de operaciones impresa.
export default function CotizadorPage() {
  const [pestana, setPestana] = useState('cotizar') // cotizar | guardadas
  const [inicial, setInicial] = useState(null)
  const [vuelta, setVuelta] = useState(0) // para reiniciar el cotizador al abrir una guardada
  const [guardadas, setGuardadas] = useState(0)
  const [modo, setModo] = useState('prenda') // prenda | hoja

  function volverACotizar(c) {
    setInicial({ nombre: c.nombre, prenda: c.prenda, folios: (c.operaciones || []).map((o) => o.folio), piezas: c.piezas, operadoras: c.operadoras })
    setModo(esCotizacionDeHoja(c) ? 'hoja' : 'prenda')
    setVuelta((n) => n + 1)
    setPestana('cotizar')
    window.scrollTo(0, 0)
  }

  function nueva() {
    setInicial(null)
    setVuelta((n) => n + 1)
  }

  function cambiarModo(m) {
    if (m === modo) return
    setModo(m)
    nueva()
  }

  return (
    <RequireRole allow={canUsarCotizador}>
      <div className="page">
        <h2 className="section-title">Cotizador</h2>
        <div className="notas-pestanas" role="tablist">
          <button type="button" role="tab" aria-selected={pestana === 'cotizar'} className={'notas-pestana' + (pestana === 'cotizar' ? ' notas-pestana--activa' : '')} onClick={() => setPestana('cotizar')}>
            Cotizar
          </button>
          <button type="button" role="tab" aria-selected={pestana === 'guardadas'} className={'notas-pestana' + (pestana === 'guardadas' ? ' notas-pestana--activa' : '')} onClick={() => setPestana('guardadas')}>
            Guardadas
          </button>
        </div>
        {pestana === 'cotizar' ? (
          <>
            <div className="cotizador__modo" role="group" aria-label="Cómo cotizar">
              <button type="button" className={'btn btn--small ' + (modo === 'prenda' ? 'btn--primary' : 'btn--secondary')} aria-pressed={modo === 'prenda'} onClick={() => cambiarModo('prenda')}>
                Por prenda
              </button>
              <button type="button" className={'btn btn--small ' + (modo === 'hoja' ? 'btn--primary' : 'btn--secondary')} aria-pressed={modo === 'hoja'} onClick={() => cambiarModo('hoja')}>
                Subir hoja de operaciones
              </button>
            </div>
            {inicial && (
              <div>
                <button type="button" className="btn btn--ghost btn--small" onClick={nueva}>
                  Empezar una nueva
                </button>
              </div>
            )}
            {modo === 'hoja' ? (
              <CotizarDesdeHoja key={vuelta} inicial={inicial} onGuardada={() => setGuardadas((n) => n + 1)} />
            ) : (
              <Cotizador key={vuelta} inicial={inicial} onGuardada={() => setGuardadas((n) => n + 1)} />
            )}
          </>
        ) : (
          <CotizacionesGuardadas onVolverACotizar={volverACotizar} recargar={guardadas} />
        )}
      </div>
    </RequireRole>
  )
}
