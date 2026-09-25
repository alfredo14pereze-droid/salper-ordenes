import { useEffect, useMemo, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState } from '../components/common/States'
import PdfPreviewModal from '../components/pdf/PdfPreviewModal'
import { canViewProduccionMontos } from '../utils/permissions'
import { historialValores, fetchOperadorasTodas, revisionSemana } from '../services/produccionService'
import { agruparSemanas, estadisticasOperadora, serieOperadora, UMBRAL_CAMBIO_PCT } from '../utils/produccionStats'
import { buildProduccionOperadorasPdfBlob, buildProduccionRankingPdfBlob, produccionPdfFileName } from '../utils/generateProduccionPdf'

// V70 — Dashboard de producción (admin_general / admin_fabrica): una fila por operadora con su semana
// actual vs anterior vs promedio de las 4 anteriores, mejor semana y una clasificación simple; más los
// imprimibles (hoja por operadora y ranking) con vista previa. "Valor generado" ≠ sueldo.
export default function ProduccionDashboardPage() {
  return (
    <RequireRole allow={canViewProduccionMontos}>
      <Dashboard />
    </RequireRole>
  )
}

const money = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const dia = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}
const CLASE = { 'Arriba de su promedio': 'arriba', 'En su promedio': 'igual', 'Abajo de su promedio': 'abajo', 'Sin base': 'sinbase' }

function Dashboard() {
  const [semanas, setSemanas] = useState([])
  const [operadoras, setOperadoras] = useState([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [generando, setGenerando] = useState(false)
  const [errImp, setErrImp] = useState(null)

  useEffect(() => {
    Promise.all([historialValores(16), fetchOperadorasTodas()]).then(([h, o]) => {
      const err = h.error || o.error
      if (err) setError(err)
      else {
        setSemanas(agruparSemanas(h.data || []))
        setOperadoras((o.data || []).filter((x) => x.activo))
      }
      setLoading(false)
    })
  }, [])

  const semana = semanas[idx]
  const filas = useMemo(() => {
    if (!semana) return []
    return operadoras
      .map((op) => ({ op, st: estadisticasOperadora(semanas, op.id, idx) }))
      .sort((a, b) => b.st.actual - a.st.actual)
  }, [operadoras, semanas, idx, semana])

  async function imprimir(tipo, soloId) {
    setGenerando(true)
    setErrImp(null)
    const { data: rev, error: err } = await revisionSemana(semana.id)
    if (err) {
      setGenerando(false)
      return setErrImp(err.message)
    }
    const porOp = new Map((rev || []).map((r) => [r.operadora_id, r]))
    try {
      if (tipo === 'ranking') {
        const blob = await buildProduccionRankingPdfBlob(semana, rev || [])
        setPreview({ blob, fileName: produccionPdfFileName('ranking', semana) })
      } else {
        const personas = filas
          .filter((f) => (soloId ? f.op.id === soloId : true))
          .map((f) => ({
            op: f.op,
            stats: f.st,
            serie: serieOperadora(semanas, f.op.id, idx, 8),
            premio: porOp.get(f.op.id) || null,
            participantes: (rev || []).length,
          }))
        const blob = await buildProduccionOperadorasPdfBlob(semana, personas)
        setPreview({ blob, fileName: produccionPdfFileName(soloId ? 'hoja' : 'hojas', semana) })
      }
    } catch (e) {
      setErrImp(`No se pudo generar el PDF: ${e.message}`)
    }
    setGenerando(false)
  }

  if (loading) return <Loading label="Cargando producción…" />
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />
  if (!semana) return <p className="page">Todavía no hay semanas de producción.</p>

  return (
    <div className="page">
      <h2 className="section-title">Producción por operadora</h2>
      <p className="template-hint">
        Valor generado = lo que produjo cada operadora (no es su sueldo). Clasificación: arriba/abajo de su promedio cuando cambia
        ±{UMBRAL_CAMBIO_PCT}% contra el promedio de sus 4 semanas anteriores.
      </p>

      <div className="revision__barra">
        <label>
          Semana
          <select className="input" value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
            {semanas.slice(0, 12).map((s, i) => (
              <option key={s.id} value={i}>
                {dia(s.fecha_inicio)} – {dia(s.fecha_fin)} · {s.estado === 'aprobada' ? 'aprobada' : s.estado === 'en_revision' ? 'en revisión' : 'abierta'}
              </option>
            ))}
          </select>
        </label>
        <div className="revision__acciones">
          <button type="button" className="btn btn--secondary" disabled={generando} onClick={() => imprimir('ranking')}>
            Imprimir ranking
          </button>
          <button type="button" className="btn btn--primary" disabled={generando} onClick={() => imprimir('hojas')}>
            {generando ? 'Generando…' : 'Imprimir hojas por operadora'}
          </button>
        </div>
      </div>
      {errImp && <p className="form-error">{errImp}</p>}
      {semana.estado !== 'aprobada' && <p className="template-hint">Semana sin aprobar: cifras provisionales; los premios de los imprimibles son una vista previa.</p>}

      <div className="revision__tabla-wrap">
        <table className="simple-table revision__tabla">
          <thead>
            <tr>
              <th>Operadora</th>
              <th>Semana actual</th>
              <th>Semana anterior</th>
              <th>Promedio 4 sem.</th>
              <th>Cambio</th>
              <th>Mejor semana</th>
              <th>Sem. con datos</th>
              <th>Clasificación</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filas.map(({ op, st }) => (
              <tr key={op.id}>
                <td>
                  {op.numero_operadora ?? '—'} · {op.nombre}
                  {!op.participa_bonos && <small> (sin bonos)</small>}
                </td>
                <td>
                  <b>{money(st.actual)}</b>
                </td>
                <td>{money(st.anterior)}</td>
                <td>{money(st.promedio4)}</td>
                <td>{st.cambioPct == null ? '—' : `${st.cambioPct > 0 ? '+' : ''}${st.cambioPct.toFixed(0)}%`}</td>
                <td>{st.mejor ? `${money(st.mejor.valor)} (${dia(st.mejor.fecha_fin)})` : '—'}</td>
                <td>{st.conDatos}</td>
                <td>
                  <span className={`badge produccion__clase produccion__clase--${CLASE[st.clasificacion]}`}>{st.clasificacion}</span>
                </td>
                <td>
                  <button type="button" className="btn btn--ghost btn--small" disabled={generando} onClick={() => imprimir('hojas', op.id)}>
                    Hoja
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview && <PdfPreviewModal blob={preview.blob} fileName={preview.fileName} onClose={() => setPreview(null)} />}
    </div>
  )
}
