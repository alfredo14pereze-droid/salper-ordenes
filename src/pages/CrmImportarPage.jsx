import { useState } from 'react'
import { Link } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { canImportarCrm } from '../utils/permissions'
import { fetchExistentesParaImportar, importarProspectos } from '../services/crmService'
import { CSV_COLUMNAS, leerCsvProspectos, previaImportacion } from '../utils/crm'
import '../components/crm/crm.css'

// V207 — Importación (una sola vez) del Excel "Formato reporte prospectos",
// guardado como CSV. Solo crm.importar (admin_general).
export default function CrmImportarPage() {
  return (
    <RequireRole allow={canImportarCrm}>
      <Importar />
    </RequireRole>
  )
}

function Importar() {
  const [archivo, setArchivo] = useState(null)
  const [lectura, setLectura] = useState(null) // { filas, errores, faltan }
  const [previa, setPrevia] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState(null)

  async function elegir(ev) {
    const file = ev.target.files?.[0]
    setError(null)
    setResultado(null)
    setLectura(null)
    setPrevia(null)
    if (!file) return
    setArchivo(file.name)
    setCargando(true)
    const texto = await file.text()
    const l = leerCsvProspectos(texto)
    setLectura(l)
    if (l.filas.length) {
      const { data, error: err } = await fetchExistentesParaImportar()
      if (err) setError(err)
      else setPrevia(previaImportacion(l.filas, data))
    }
    setCargando(false)
  }

  async function confirmar() {
    setError(null)
    setCargando(true)
    const { data, error: err } = await importarProspectos(lectura.filas)
    setCargando(false)
    if (err) return setError(err)
    setResultado(data)
    setPrevia(null)
  }

  return (
    <div className="page page--narrow crm">
      <Link to="/crm" className="crm-volver">← Prospectos</Link>
      <div className="section-header">
        <h2 className="section-title">Importar prospectos del Excel</h2>
      </div>

      <section className="card crm-card">
        <h3 className="crm-card__titulo">1. Prepara el archivo</h3>
        <p>
          En Excel: <strong>Archivo → Guardar como → CSV UTF-8 (delimitado por comas)</strong>. La primera fila debe tener exactamente estos
          encabezados:
        </p>
        <code className="crm-columnas">{CSV_COLUMNAS.join(', ')}</code>
        <ul className="crm-ayuda">
          <li>Puedes repetir la misma empresa en varias filas (una por contacto, llamada o seguimiento): se juntan en una sola.</li>
          <li>Las fechas van como AAAA-MM-DD (ej. 2026-11-13).</li>
          <li>Si una empresa ya está en el CRM, se le agregan los datos nuevos; no se duplica. Importar el mismo archivo dos veces no repite nada.</li>
        </ul>
      </section>

      <section className="card crm-card">
        <h3 className="crm-card__titulo">2. Súbelo y revisa</h3>
        <input type="file" accept=".csv,text/csv" onChange={elegir} />
        {cargando && <p className="crm-muted">Leyendo…</p>}

        {lectura && (
          <>
            {lectura.faltan.length > 0 && lectura.faltan[0] !== 'empresa' && (
              <p className="crm-aviso">
                Faltan columnas (se tomarán como vacías): <strong>{lectura.faltan.join(', ')}</strong>
              </p>
            )}
            {lectura.errores.length > 0 && (
              <details className="crm-aviso" open={lectura.errores.length <= 5}>
                <summary>
                  {lectura.errores.length} aviso{lectura.errores.length === 1 ? '' : 's'} en el archivo
                </summary>
                <ul>
                  {lectura.errores.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

        {previa && (
          <div className="crm-previa">
            <p>
              De <strong>{archivo}</strong> ({lectura.filas.length} filas) se van a crear:
            </p>
            <div className="crm-previa__numeros">
              <div><strong>{previa.nuevas}</strong><span>empresas nuevas</span></div>
              <div><strong>{previa.contactos}</strong><span>contactos</span></div>
              <div><strong>{previa.actividades}</strong><span>registros de bitácora</span></div>
              <div><strong>{previa.seguimientos}</strong><span>seguimientos</span></div>
            </div>
            {previa.existentes > 0 && (
              <p className="crm-muted">
                {previa.existentes} empresa{previa.existentes === 1 ? '' : 's'} ya estaba{previa.existentes === 1 ? '' : 'n'} en el CRM: solo se le{previa.existentes === 1 ? '' : 's'} agrega lo nuevo.
              </p>
            )}
            <details>
              <summary>Ver empresa por empresa ({previa.grupos.length})</summary>
              <div className="crm-tabla-wrap">
                <table className="simple-table crm-tabla crm-tabla--compacta">
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Contactos</th>
                      <th>Bitácora</th>
                      <th>Seguimientos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.grupos.map((g) => (
                      <tr key={g.key}>
                        <td>
                          {g.nombre} {g.existe && <span className="crm-badge crm-badge--borde">ya existe</span>}
                          {g.nombresCsv.length > 1 && <div className="crm-muted">Escrita como: {g.nombresCsv.join(' / ')}</div>}
                        </td>
                        <td>{g.contactos}</td>
                        <td>{g.actividades}</td>
                        <td>{g.seguimientos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            {error && <p className="form-error">{error.message}</p>}
            <div className="crm-form__botones">
              <button type="button" className="btn btn--primary" disabled={cargando || previa.grupos.length === 0} onClick={confirmar}>
                {cargando ? 'Importando…' : 'Confirmar importación'}
              </button>
            </div>
          </div>
        )}
        {!previa && error && <p className="form-error">{error.message}</p>}

        {resultado && (
          <div className="crm-resultado">
            <p>
              ✓ Listo. Se crearon {resultado.empresas} empresas, {resultado.contactos} contactos, {resultado.actividades} registros de bitácora y{' '}
              {resultado.seguimientos} seguimientos.
            </p>
            <Link to="/crm" className="btn btn--primary">Ver prospectos</Link>
          </div>
        )}
      </section>
    </div>
  )
}
