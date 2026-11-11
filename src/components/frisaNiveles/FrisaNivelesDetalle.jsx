import { useEffect, useState } from 'react'
import Modal from '../talleros/Modal'
import { fetchConteosStock, capturarStock } from '../../services/frisaNivelesService'
import { calcularNiveles, formatoDemanda } from '../../utils/frisaNiveles'
import { EstadoBadge, fechaCorta, NombreFrisa } from './comunes'
import { nombreFrisa } from '../../utils/frisaColores'

const num = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX'))
const fechaHora = (d) => new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

// Detalle de una clave: consumos, demanda, niveles, nota, captura con
// comentario e historial de conteos.
export default function FrisaNivelesDetalle({ fila, cfg, puedeCapturar, verDemanda = false, onGuardado, onClose }) {
  const [conteos, setConteos] = useState(null)
  const [errorHist, setErrorHist] = useState(null)
  const [stock, setStock] = useState(String(fila.stock_actual))
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(null)

  useEffect(() => {
    let vivo = true
    fetchConteosStock(fila.id).then(({ data, error: e }) => {
      if (!vivo) return
      if (e) setErrorHist(e.message)
      else setConteos(data || [])
    })
    return () => { vivo = false }
  }, [fila.id, fila.stock_actual])

  const valido = /^\d+$/.test(stock)
  const apartado = fila.apartado || 0
  const n = valido ? calcularNiveles({ ...fila, stock_actual: Number(stock), disponible: Number(stock) - apartado }, cfg) : fila.niveles
  const max25 = Math.max(fila.consumo_2025 || 0, fila.consumo_2026 || 0, 1)
  const atributos = [
    ['Tipo', fila.tipo], ['Reflejante', fila.reflejante], ['Manga', fila.manga], ['Color', fila.color],
  ].filter(([, v]) => v)

  async function guardar(e) {
    e.preventDefault()
    if (!valido) return setError('Escribe un número entero de 0 o más.')
    setGuardando(true)
    setError(null)
    setOk(null)
    const { data, error: err } = await capturarStock({ clave: fila.clave, stock: Number(stock), comentario })
    setGuardando(false)
    if (err) return setError(err.message)
    setComentario('')
    setOk('Stock guardado.')
    onGuardado(data)
  }

  return (
    <Modal title={nombreFrisa(fila.nombre)} onClose={onClose}>
      <div className="frisa-niveles__detalle">
        <NombreFrisa producto={fila} className="frisa-niveles__nombre" />
        {atributos.length > 0 && (
          <p className="frisa__sub">{atributos.map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
        )}

        <div className="frisa-niveles__consumos">
          {[['2025', fila.consumo_2025], ['2026', fila.consumo_2026]].map(([anio, c]) => (
            <div key={anio} className="frisa-niveles__barra">
              <span className="frisa-niveles__barra-anio">{anio}</span>
              <span className="frisa-niveles__barra-pista">
                <span className={'frisa-niveles__barra-relleno' + (anio === '2026' ? ' is-actual' : '')} style={{ width: `${((c || 0) / max25) * 100}%` }} />
              </span>
              <strong>{num(c)} pzas</strong>
            </div>
          ))}
          <p className="frisa__sub">2026 = {cfg.fecha_corte_consumo ? `${fechaCorta(cfg.fecha_inicio_consumo)} – ${fechaCorta(cfg.fecha_corte_consumo)}` : 'en el periodo'} ({cfg.dias_periodo} días); 2025 es el año completo.</p>
        </div>

        <dl className="frisa-niveles__datos">
          <div><dt>Real (en bodega)</dt><dd>{num(fila.stock_actual)}</dd></div>
          <div><dt>Apartado</dt><dd>{num(apartado)}</dd></div>
          <div><dt>Disponible</dt><dd>{num((valido ? Number(stock) : fila.stock_actual) - apartado)}</dd></div>
          {verDemanda && <div><dt>Demanda diaria</dt><dd>{formatoDemanda(n.demanda)}</dd></div>}
          <div><dt>Clase ABC</dt><dd>{fila.clase_abc || '—'}</dd></div>
          <div><dt>Tendencia</dt><dd>{fila.tendencia || '—'}</dd></div>
          <div><dt>Mínimo ({cfg.dias_minimo} d)</dt><dd>{num(n.minimo)}</dd></div>
          <div><dt>Reorden ({cfg.dias_reorden} d)</dt><dd>{num(n.reorden)}</dd></div>
          <div><dt>Máximo ({cfg.dias_maximo} d)</dt><dd>{num(n.maximo)}</dd></div>
          <div><dt>Estado</dt><dd><EstadoBadge estado={n.estado} /></dd></div>
          <div><dt>A PEDIR</dt><dd><strong>{n.aPedir == null ? '—' : num(n.aPedir)}</strong></dd></div>
        </dl>

        {fila.nota && <p className="frisa-niveles__notatxt"><strong>Nota:</strong> {fila.nota}</p>}

        {puedeCapturar ? (
          <form className="frisa-niveles__captura" onSubmit={guardar}>
            <label>
              <span className="field-label">Real contado (almacén fábrica)</span>
              <input className="input" type="number" min="0" step="1" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} />
            </label>
            <label className="frisa-niveles__captura-comentario">
              <span className="field-label">Comentario (opcional)</span>
              <input className="input" value={comentario} placeholder="Ej. conteo físico" onChange={(e) => setComentario(e.target.value)} />
            </label>
            <button type="submit" className="btn btn--primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar conteo'}</button>
            {error && <p className="form-error">{error}</p>}
            {ok && <p className="frisa__ok">{ok}</p>}
          </form>
        ) : (
          <p><strong>Stock actual:</strong> {num(fila.stock_actual)} pzas</p>
        )}
        {fila.stock_actualizado_en && (
          <p className="frisa__sub">Último conteo: {fechaHora(fila.stock_actualizado_en)}{fila.stock_actualizado_por_nombre ? ` · ${fila.stock_actualizado_por_nombre}` : ''}</p>
        )}

        <h4 className="section-title section-title--small">Historial de conteos</h4>
        {errorHist && <p className="form-error">{errorHist}</p>}
        {!conteos && !errorHist && <p className="frisa__sub">Cargando…</p>}
        {conteos && !conteos.length && <p className="frisa__sub">Sin conteos todavía.</p>}
        {conteos && conteos.length > 0 && (
          <ul className="frisa-niveles__historial">
            {conteos.map((c) => (
              <li key={c.id}>
                <span><strong>{c.stock_anterior == null ? '' : `${num(c.stock_anterior)} → `}{num(c.stock_nuevo)}</strong>
                  {c.origen === 'importacion' && <span className="frisa__prueba">importación</span>}</span>
                <span className="frisa__sub">{fechaHora(c.fecha)}{c.usuario_nombre ? ` · ${c.usuario_nombre}` : ''}</span>
                {c.comentario && <span className="frisa__sub">{c.comentario}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
