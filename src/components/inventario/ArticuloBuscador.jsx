import { useMemo, useState } from 'react'
import { buscar } from '../../utils/inventarioBusqueda'

// V121 — buscador flexible de artículos, el mismo en traspasos y en la
// pantalla principal (ver src/utils/inventarioBusqueda.js para las
// reglas). Resultados mientras se escribe, con la existencia de cada uno;
// lo que está en 0 sale en gris, no se esconde.
//   existencia(a) → número que se muestra y que decide el orden.
//   etiquetaExistencia → texto junto al número (ej. "en origen").
export default function ArticuloBuscador({
  articulos,
  existencia = (a) => a.total,
  etiquetaExistencia = '',
  excluirIds,
  onSelect,
  placeholder = 'Busca la prenda… (ej. po tri 12)',
  disabled = false,
  autoFocus = false,
  limite = 30,
}) {
  const [q, setQ] = useState('')

  const resultados = useMemo(() => {
    if (!q.trim()) return []
    const candidatos = excluirIds?.size ? articulos.filter((a) => !excluirIds.has(a.articuloId)) : articulos
    return buscar(candidatos, q, { existencia, limite })
  }, [articulos, q, excluirIds, existencia, limite])

  return (
    <div className="inv-buscador">
      <input
        type="search"
        className="input"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      {q.trim() && (
        <ul className="inv-search-results">
          {resultados.length === 0 && <li className="inv-search-results__empty">Nada coincide con “{q.trim()}”.</li>}
          {resultados.map((a) => {
            const hay = existencia(a)
            return (
              <li key={a.articuloId}>
                <button
                  type="button"
                  className={hay > 0 ? '' : 'inv-search-results__cero'}
                  onClick={() => {
                    onSelect(a)
                    setQ('')
                  }}
                >
                  <span>{a.nombre}</span>
                  <span className="inv-search-results__hay">
                    {hay} {etiquetaExistencia}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
