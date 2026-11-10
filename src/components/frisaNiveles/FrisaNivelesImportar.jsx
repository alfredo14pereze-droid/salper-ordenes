import { useState } from 'react'
import Modal from '../talleros/Modal'
import { importarNiveles, fetchFrisaNiveles } from '../../services/frisaNivelesService'
import { compararConSheet, parseNivelesCSV, parseSupuestosCSV } from '../../utils/frisaNiveles'

const leer = (file) => new Promise((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result))
  r.onerror = () => rej(r.error)
  r.readAsText(file, 'utf-8')
})

// Importar (o reimportar) Niveles.csv + Supuestos.csv del Sheet.
// Antes de importar: vista previa y comparación de lo que calcula la app
// contra las columnas del Sheet. Después: la misma comparación con lo que
// quedó guardado en la base.
export default function FrisaNivelesImportar({ existentes, onClose, recargar }) {
  const [niveles, setNiveles] = useState(null) // { nombre, productos, sheet, errores }
  const [supuestos, setSupuestos] = useState(null) // { nombre, config, errores }
  const [importando, setImportando] = useState(false)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null) // { nuevos, actualizados, diferencias }

  async function elegirNiveles(file) {
    if (!file) return
    setResultado(null)
    setNiveles({ nombre: file.name, ...parseNivelesCSV(await leer(file)) })
  }
  async function elegirSupuestos(file) {
    if (!file) return
    setResultado(null)
    setSupuestos({ nombre: file.name, ...parseSupuestosCSV(await leer(file)) })
  }

  const claves = new Set(existentes.map((p) => p.clave.toLowerCase()))
  const errores = [...(niveles?.errores || []), ...(supuestos?.errores || [])]
  const listo = niveles && supuestos && !errores.length && niveles.productos.length > 0
  const nuevos = listo ? niveles.productos.filter((p) => !claves.has(p.clave.toLowerCase())).length : 0
  const diferencias = listo ? compararConSheet(niveles.productos, niveles.sheet, supuestos.config) : []

  async function importar() {
    setImportando(true)
    setError(null)
    const { data, error: e } = await importarNiveles(niveles.productos, supuestos.config)
    if (e) {
      setImportando(false)
      return setError(e.message)
    }
    // Validación después de importar: con lo que quedó en la base (el stock de
    // las claves que ya existían no se cambió).
    const { data: d2 } = await fetchFrisaNiveles()
    setImportando(false)
    const guardados = (d2?.productos || []).filter((p) => niveles.sheet[p.clave])
    setResultado({ ...data, diferencias: compararConSheet(guardados, niveles.sheet, d2?.config || supuestos.config) })
    recargar()
  }

  return (
    <Modal title="Importar del Sheet" onClose={onClose}>
      <div className="frisa-niveles__importar">
        <p className="frisa__nota">
          Exporta del Google Sheet las hojas <strong>Niveles</strong> y <strong>Supuestos</strong> como CSV. Se actualiza por clave: los consumos,
          nombre y datos se reemplazan; <strong>el stock que ya se capturó en la app no se toca</strong> (el del CSV solo entra en claves nuevas).
        </p>
        <label className="frisa-niveles__archivo">
          <span className="field-label">Niveles.csv</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => elegirNiveles(e.target.files?.[0])} />
          {niveles && !niveles.errores.length && <span className="frisa__sub">{niveles.nombre}: {niveles.productos.length} claves</span>}
        </label>
        <label className="frisa-niveles__archivo">
          <span className="field-label">Supuestos.csv</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => elegirSupuestos(e.target.files?.[0])} />
          {supuestos && !supuestos.errores.length && (
            <span className="frisa__sub">
              Periodo {supuestos.config.dias_periodo} días · mínimo {supuestos.config.dias_minimo} · reorden {supuestos.config.dias_reorden} · máximo {supuestos.config.dias_maximo}
            </span>
          )}
        </label>

        {errores.length > 0 && (
          <ul className="form-error frisa-niveles__errores">{errores.slice(0, 15).map((e) => <li key={e}>{e}</li>)}</ul>
        )}

        {listo && !resultado && (
          <>
            <p><strong>{niveles.productos.length}</strong> claves: {nuevos} nuevas, {niveles.productos.length - nuevos} ya existen.</p>
            <Diferencias diferencias={diferencias} titulo="Comparación antes de importar (app vs. Sheet, con el stock del CSV)" />
            {error && <p className="form-error">{error}</p>}
            <div className="frisa__botones">
              <button type="button" className="btn btn--primary" disabled={importando} onClick={importar}>
                {importando ? 'Importando…' : `Importar ${niveles.productos.length} claves`}
              </button>
              <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
            </div>
          </>
        )}

        {resultado && (
          <>
            <p className="frisa__ok">Listo: {resultado.nuevos} claves nuevas, {resultado.actualizados} actualizadas. Supuestos guardados.</p>
            <Diferencias diferencias={resultado.diferencias} titulo="Validación después de importar (lo guardado vs. Sheet)" />
            {resultado.actualizados > 0 && resultado.diferencias.length > 0 && (
              <p className="frisa__sub">Si una clave ya tenía stock capturado en la app, sus diferencias de estado / A PEDIR son por ese stock, no por el cálculo.</p>
            )}
            <button type="button" className="btn btn--primary" onClick={onClose}>Cerrar</button>
          </>
        )}
      </div>
    </Modal>
  )
}

function Diferencias({ diferencias, titulo }) {
  if (!diferencias.length) return <p className="frisa__ok">{titulo}: todas las claves coinciden ✓</p>
  const claves = new Set(diferencias.map((d) => d.clave)).size
  return (
    <div>
      <p className="frisa__falta">{titulo}: {diferencias.length} diferencias en {claves} claves.</p>
      <div className="revision__tabla-wrap frisa-niveles__dif">
        <table className="simple-table frisa-tabla">
          <thead><tr><th>Producto</th><th>Campo</th><th className="num">Sheet</th><th className="num">App</th></tr></thead>
          <tbody>
            {diferencias.map((d) => (
              <tr key={d.clave + d.campo}><td>{d.clave}</td><td>{d.campo}</td><td className="num">{String(d.sheet)}</td><td className="num"><strong>{String(d.app)}</strong></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
