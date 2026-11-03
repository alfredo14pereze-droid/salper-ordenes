import { resumenCambio } from '../../utils/cambiosOrden'
import { formatDateTime } from '../../utils/dates'

// V178 — un cambio registrado: quién y cuándo, y qué cambió campo por campo.
// `estado` (opcional) va al final de la línea de quién/cuándo.
export default function CambioDetalle({ cambio, tiposPorClave, estado }) {
  const { generales, prendas, total, nota } = resumenCambio(cambio, tiposPorClave)
  const quien = cambio.hecho_por_nombre || (cambio.campos?._anterior ? 'No se registró quién' : 'Alguien')
  return (
    <div className="cambio">
      <p className="cambio__quien">
        <b>{quien}</b> · {formatDateTime(cambio.hecho_en)}
        {estado && <span className="cambio__estado"> · {estado}</span>}
      </p>
      <ul className="cambio__lista">
        {nota && <li>{nota}</li>}
        {generales.map((g) => (
          <li key={g.label}>
            <span className="cambio__campo">{g.label}:</span> <s className="cambio__antes">{g.antes}</s> → <b>{g.despues}</b>
          </li>
        ))}
        {prendas.map((p, i) => (
          <li key={i} className={`cambio__prenda cambio__prenda--${p.tipo}`}>
            <span className="cambio__campo">{p.titulo}</span>
            {p.lineas.length > 0 && (
              <ul>
                {p.lineas.map((l, j) => (
                  <li key={j}>{l}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {total && (
          <li>
            <span className="cambio__campo">Total de piezas:</span> {total}
          </li>
        )}
      </ul>
    </div>
  )
}
