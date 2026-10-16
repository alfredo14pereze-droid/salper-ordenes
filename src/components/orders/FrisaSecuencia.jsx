import { etiquetaProceso, secuenciaDeOrden } from '../../utils/frisa'

// V155 — la secuencia de procesos que se copió a una orden de Frisa, en
// orden, con las impresiones de cada paso. Con `etapas` (filas de
// orden_etapas) marca las ya completadas; `conNotas` agrega las notas.
export default function FrisaSecuencia({ order, etapas = null, conNotas = false }) {
  const procesos = secuenciaDeOrden(order)
  if (procesos.length === 0) return null
  return (
    <ol className="frisa-secuencia-orden">
      {procesos.map((p) => {
        const estado = etapas?.find((e) => e.etapa === p.etapa)?.estado
        return (
          <li key={p.proceso} className={estado === 'completado' ? 'is-completado' : undefined}>
            {p.orden}. {etiquetaProceso(p.proceso)}
            {p.impresiones ? <b> · {p.impresiones} {p.impresiones === 1 ? 'impresión' : 'impresiones'}</b> : null}
            {estado === 'completado' ? ' ✓' : null}
            {conNotas && p.notas ? <span className="pantone-hint"> — {p.notas}</span> : null}
          </li>
        )
      })}
    </ol>
  )
}
