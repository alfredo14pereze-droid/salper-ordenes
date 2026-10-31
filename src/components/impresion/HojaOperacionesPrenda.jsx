import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchOperacionesDePrenda } from '../../services/produccionService'
import { registrarHojaImpresa } from '../../services/hojasImpresasService'
import './impresion.css'

// Hoja informativa para pegar en la línea: folio, operación y tiempo de cada
// operación ACTIVA de una prenda. Sin precios, costos, totales ni casillas.
// El título se puede cambiar antes de imprimir (arranca con el nombre de la
// prenda). Al imprimir solo sale la hoja (ver impresion.css).
// V172 — con `operaciones` (las de una cotización guardada) imprime esas y no
// las del catálogo; `tituloInicial` cambia el título con el que arranca.
export default function HojaOperacionesPrenda({ prenda, volverA, operaciones = null, tituloInicial = null }) {
  const [ops, setOps] = useState(operaciones)
  const [error, setError] = useState(null)
  const [titulo, setTitulo] = useState(tituloInicial || prenda)
  const [aviso, setAviso] = useState(null)
  const [registrando, setRegistrando] = useState(false)

  // V173 — al imprimir, la hoja se guarda en "Hojas impresas" (misma prenda y
  // título = la misma hoja). Si no se puede guardar, igual se imprime.
  async function imprimir() {
    setRegistrando(true)
    setAviso(null)
    const { error: err } = await registrarHojaImpresa({ prenda, titulo: titulo.trim() || prenda, folios: ops.map((o) => o.folio) })
    setRegistrando(false)
    setAviso(err ? { error: true, texto: `No se pudo guardar en «Hojas impresas»: ${err.message}` } : { error: false, texto: '✓ Guardada en «Hojas impresas».' })
    window.print()
  }

  useEffect(() => {
    if (operaciones) return
    setTitulo(prenda)
    let vivo = true
    fetchOperacionesDePrenda(prenda).then(({ data, error: err }) => {
      if (!vivo) return
      if (err) setError(err.message)
      else setOps(data || [])
    })
    return () => {
      vivo = false
    }
  }, [prenda, operaciones])

  // Mientras esta hoja está abierta, la impresión oculta todo lo demás de la app.
  useEffect(() => {
    document.body.classList.add('imprimiendo-hoja')
    return () => document.body.classList.remove('imprimiendo-hoja')
  }, [])

  return (
    <div className="page hoja-impresion">
      <div className="hoja-impresion__controles">
        <Link to={volverA} className="btn btn--ghost btn--small">
          ← Volver
        </Link>
        <label className="hoja-impresion__campo">
          Título de la hoja
          <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <button type="button" className="btn btn--primary" onClick={imprimir} disabled={!ops || ops.length === 0 || registrando}>
          {registrando ? 'Guardando…' : 'Imprimir'}
        </button>
      </div>
      {aviso && <p className={'hoja-impresion__controles ' + (aviso.error ? 'form-error' : 'nota-leido--ok')}>{aviso.texto}</p>}

      <h1 className="hoja-impresion__titulo">{titulo.trim() || prenda}</h1>
      {error && <p className="form-error">{error}</p>}
      {!ops && !error && <p className="template-hint">Cargando operaciones…</p>}
      {ops && ops.length === 0 && <p className="template-hint">Esta prenda no tiene operaciones activas.</p>}
      {ops && ops.length > 0 && (
        <table className="hoja-impresion__tabla">
          <thead>
            <tr>
              <th className="hoja-impresion__folio">Folio</th>
              <th>Operación</th>
              <th className="hoja-impresion__num">Tiempo (seg)</th>
            </tr>
          </thead>
          <tbody>
            {ops.map((o) => (
              <tr key={o.folio}>
                <td className="hoja-impresion__folio">{o.folio}</td>
                <td>{o.operacion}</td>
                <td className="hoja-impresion__num">{Number(o.segundos).toLocaleString('es-MX', { maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
