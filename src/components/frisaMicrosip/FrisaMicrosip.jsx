import { nombreFrisa } from '../../utils/frisaColores'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Loading, ErrorState } from '../common/States'
import { canRevisarMicrosip } from '../../utils/permissions'
import { fetchMicrosipTodo, guardarRevisionMicrosip } from '../../services/frisaMicrosipService'
import { leerXlsx } from '../../utils/xlsxLector'
import { articulosDeFilas, articulosDeCSV, totalDelReporte, fechaDelReporte, ligarMicrosip, diasDesde } from '../../utils/frisaMicrosip'
import { hoyISO } from '../../utils/frisaSurtido'
import { NombreFrisa, fechaCorta } from '../frisaNiveles/comunes'

const num = (n) => Number(n || 0).toLocaleString('es-MX')
const signo = (n) => (n > 0 ? `+${num(n)}` : num(n))
const COMO = { aprendido: 'código guardado', clave: 'por la clave', nombre: 'por el nombre', manual: 'elegida a mano' }

// V188 — Cada 10 días: subir el Excel de existencias de Microsip, ver diferencias y ajustar.
export default function FrisaMicrosip() {
  const { role } = useAuth()
  const puede = canRevisarMicrosip(role)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [archivo, setArchivo] = useState(null) // { nombre, articulos, total, fecha }
  const [manual, setManual] = useState({}) // codigo → producto_id
  const [ajustar, setAjustar] = useState(new Set())
  const [fecha, setFecha] = useState(hoyISO())
  const [notas, setNotas] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [errArchivo, setErrArchivo] = useState(null)
  const [abierta, setAbierta] = useState(null)

  const recargar = useCallback(async () => {
    const { data, error: e } = await fetchMicrosipTodo()
    if (e) setError(e)
    else { setError(null); setDatos(data) }
    setCargando(false)
  }, [])
  useEffect(() => { recargar() }, [recargar])

  const comparacion = useMemo(() => {
    if (!archivo || !datos) return null
    const codigos = [...datos.codigos, ...Object.entries(manual).filter(([, pid]) => pid).map(([codigo, producto_id]) => ({ codigo, producto_id }))]
    const r = ligarMicrosip(archivo.articulos, datos.productos, codigos)
    for (const l of r.lineas) if (manual[l.codigo]) l.como = 'manual'
    return r
  }, [archivo, datos, manual])

  if (cargando) return <Loading />
  if (error) return <div className="page"><ErrorState error={error} onRetry={recargar} /></div>

  const ultima = datos.revisiones[0]
  const dias = ultima ? diasDesde(ultima.fecha_corte) : null

  async function elegir(file) {
    if (!file) return
    setLeyendo(true)
    setErrArchivo(null)
    setAviso(null)
    try {
      let filas = null
      let articulos
      if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
        articulos = articulosDeCSV(await file.text())
      } else {
        filas = await leerXlsx(await file.arrayBuffer())
        articulos = articulosDeFilas(filas)
      }
      if (!articulos.length) throw new Error('No encontré artículos en el archivo. ¿Es el reporte "Existencia y valor del inventario" de Microsip?')
      const total = filas ? totalDelReporte(filas) : null
      setArchivo({ nombre: file.name, articulos, total })
      setManual({})
      // Por omisión se ajustan todas las que tienen diferencia.
      const r = ligarMicrosip(articulos, datos.productos, datos.codigos)
      setAjustar(new Set(r.lineas.filter((l) => l.diferencia !== 0).map((l) => l.producto.id)))
      const f = filas ? fechaDelReporte(filas) : null
      if (f && f <= hoyISO()) setFecha(f)
    } catch (e) {
      setArchivo(null)
      setErrArchivo(e.message)
    }
    setLeyendo(false)
  }

  async function guardar() {
    setGuardando(true)
    setAviso(null)
    const lineas = comparacion.lineas.map((l) => ({ producto_id: l.producto.id, codigo: l.codigo, existencia: l.microsip }))
    const aj = comparacion.lineas.filter((l) => l.diferencia !== 0 && ajustar.has(l.producto.id)).map((l) => l.producto.id)
    const { data, error: e } = await guardarRevisionMicrosip({ fechaCorte: fecha, archivo: archivo.nombre, lineas, ajustar: aj, sinLigar: comparacion.sinLigar.length, notas })
    setGuardando(false)
    if (e) return setErrArchivo(e.message)
    setArchivo(null)
    setNotas('')
    setAviso(`Revisión guardada: ${data.claves} claves, ${data.diferencias} con diferencia, ${data.ajustadas} ajustadas a Microsip.`)
    recargar()
  }

  const conDif = comparacion?.lineas.filter((l) => l.diferencia !== 0) || []
  const iguales = (comparacion?.lineas.length || 0) - conDif.length
  const marcar = (id, v) => setAjustar((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n })
  const opciones = [...datos.productos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return (
    <div className="page frisa frisa-surtido">
      <div className="frisa__encabezado">
        <div>
          <h1 className="page-title">Frisa · revisión contra Microsip</h1>
          <p className="page-subtitle">
            Cada 10 días: exporta de Microsip el reporte "Existencia y valor del inventario" (línea FRISA) y súbelo tal cual (Excel o
            CSV). La página te muestra las diferencias y ajusta las que elijas.
          </p>
        </div>
      </div>

      <div className={'card frisa-microsip__ultima' + (dias == null || dias >= 10 ? ' is-vencida' : '')}>
        {ultima
          ? <p><strong>Última revisión:</strong> {fechaCorta(ultima.fecha_corte)} ({dias === 0 ? 'hoy' : `hace ${dias} día${dias === 1 ? '' : 's'}`}) · {ultima.diferencias} diferencias, {ultima.ajustadas} ajustadas · {ultima.creado_por_nombre}
            {dias >= 10 && <strong className="frisa__falta"> · Ya toca revisar</strong>}</p>
          : <p><strong>Todavía no hay revisiones.</strong> Sube el primer Excel de Microsip.</p>}
      </div>

      {aviso && <p className="frisa__ok">{aviso}</p>}

      {puede ? (
        <label className="frisa-niveles__archivo">
          <span className="field-label">Excel de Microsip (.xlsx) o CSV</span>
          <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" disabled={leyendo}
            onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = '' }} />
          {leyendo && <span className="frisa__sub">Leyendo…</span>}
        </label>
      ) : <p className="frisa__sub">La revisión la hacen los administradores.</p>}
      {errArchivo && <p className="form-error">{errArchivo}</p>}

      {comparacion && (
        <section className="frisa-restock__seccion">
          <p className="frisa__nota">
            <strong>{archivo.nombre}</strong>: {archivo.articulos.length} artículos
            {archivo.total ? ` (el reporte dice ${archivo.total.articulos} artículos, ${num(archivo.total.piezas)} piezas${archivo.total.articulos !== archivo.articulos.length ? ' — no cuadra, revisa el archivo' : ''})` : ''}.
            {' '}{comparacion.lineas.length} ligados · <strong>{conDif.length} con diferencia</strong> · {iguales} iguales.
          </p>

          {conDif.length > 0 && (
            <div className="revision__tabla-wrap">
              <table className="simple-table frisa-tabla frisa-niveles__tabla">
                <thead><tr><th>Ajustar</th><th>Clave</th><th className="num">Página</th><th className="num">Microsip</th><th className="num">Diferencia</th><th>Ligada</th></tr></thead>
                <tbody>
                  {conDif.map((l) => (
                    <tr key={l.producto.id} className={l.diferencia < 0 ? 'frisa-niveles__fila--critico' : 'frisa-niveles__fila--pedir'}>
                      <td data-label="Ajustar"><input type="checkbox" checked={ajustar.has(l.producto.id)} onChange={(e) => marcar(l.producto.id, e.target.checked)} aria-label={`Ajustar ${l.producto.clave}`} /></td>
                      <td data-label="Clave"><strong>{l.producto.clave}</strong><NombreFrisa producto={l.producto} /><div className="frisa__sub">Microsip {l.codigo}</div></td>
                      <td data-label="Página" className="num">{num(l.pagina)}</td>
                      <td data-label="Microsip" className="num"><strong>{num(l.microsip)}</strong></td>
                      <td data-label="Diferencia" className="num"><strong className={l.diferencia < 0 ? 'frisa__falta' : ''}>{signo(l.diferencia)}</strong></td>
                      <td data-label="Ligada" className="frisa__sub">{COMO[l.como]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {conDif.length === 0 && <p className="frisa__ok">Todo cuadra: la página y Microsip tienen lo mismo en las {comparacion.lineas.length} claves.</p>}

          {comparacion.sinLigar.length > 0 && (
            <div className="card frisa-restock__propuesta">
              <h3 className="section-title section-title--small">Artículos de Microsip sin clave ({comparacion.sinLigar.length})</h3>
              <p className="frisa__sub">Elige su clave (se guarda para la próxima) o déjalos fuera.</p>
              {comparacion.sinLigar.map((a) => (
                <label key={a.codigo} className="frisa-microsip__manual">
                  <span><strong>{a.codigo}</strong> · {a.nombre} · {num(a.existencia)} pzas</span>
                  <select className="input" value={manual[a.codigo] || ''} onChange={(e) => setManual({ ...manual, [a.codigo]: e.target.value })}>
                    <option value="">Dejar fuera</option>
                    {opciones.map((p) => <option key={p.id} value={p.id}>{nombreFrisa(p.nombre)} · {p.clave}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
          {comparacion.faltan.length > 0 && (
            <p className="frisa__sub">Claves de la página que no vienen en el archivo (no se tocan): {comparacion.faltan.map((p) => p.clave).join(', ')}.</p>
          )}

          <div className="frisa-form__fila">
            <label><span className="field-label">Existencias al</span><input className="input" type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} /></label>
            <label><span className="field-label">Notas (opcional)</span><input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} /></label>
          </div>
          <p className="frisa__sub">Si se entregó o subió algo a bodega después de sacar el reporte, puede salir como diferencia: no lo ajustes.</p>
          <div className="frisa__botones">
            <button type="button" className="btn btn--primary" disabled={guardando || !comparacion.lineas.length} onClick={guardar}>
              {guardando ? 'Guardando…' : `Guardar revisión y ajustar ${conDif.filter((l) => ajustar.has(l.producto.id)).length} claves`}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setArchivo(null)}>Cancelar</button>
          </div>
        </section>
      )}

      <section className="frisa-restock__seccion">
        <h2 className="section-title section-title--small">Revisiones anteriores</h2>
        {!datos.revisiones.length && <p className="frisa__sub">Ninguna todavía.</p>}
        <div className="frisa-oc-lista">
          {datos.revisiones.map((rv) => (
            <div key={rv.id} className="card frisa-surtido__tarjeta frisa-restock__compra">
              <span className="frisa-surtido__fila1">
                <span className="frisa-oc__num">{fechaCorta(rv.fecha_corte)}</span>
                <span className={'frisa-nivel frisa-nivel--' + (rv.diferencias ? 'naranja' : 'verde')}>{rv.diferencias ? `${rv.diferencias} diferencias` : 'Todo cuadró'}</span>
              </span>
              <span className="frisa__sub">{rv.claves} claves · {rv.ajustadas} ajustadas · página {num(rv.piezas_pagina)} vs Microsip {num(rv.piezas_microsip)} pzas{rv.sin_ligar ? ` · ${rv.sin_ligar} sin clave` : ''}</span>
              <span className="frisa__sub">{rv.creado_por_nombre}{rv.archivo ? ` · ${rv.archivo}` : ''}{rv.notas ? ` · ${rv.notas}` : ''}</span>
              {rv.diferencias > 0 && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setAbierta(abierta === rv.id ? null : rv.id)}>
                  {abierta === rv.id ? 'Ocultar diferencias' : 'Ver diferencias'}
                </button>
              )}
              {abierta === rv.id && (
                <ul className="frisa-niveles__historial">
                  {(rv.detalle || []).filter((d) => d.pagina !== d.microsip).map((d) => (
                    <li key={d.producto_id}><span><strong>{d.clave}</strong>: página {num(d.pagina)} → Microsip {num(d.microsip)} ({signo(d.microsip - d.pagina)}){d.ajustada ? ' · ajustada' : ' · no se ajustó'}</span></li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
