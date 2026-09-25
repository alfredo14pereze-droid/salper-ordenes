// V72 — gráficas SVG para "Estadísticas de producción". Sin dependencias; colores de los tokens del sistema
// (mismo look que las barras de Estadísticas). Las semanas PRELIMINARES (abierta / en revisión) se dibujan
// con relleno rayado y borde punteado, y llevan la leyenda "Preliminar".
const W = 720
const H = 250
const PAD = { l: 52, r: 16, t: 16, b: 34 }

const dia = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}
const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`)

function ejes(max, n) {
  const ticks = 4
  const lineas = []
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i
    const y = PAD.t + (H - PAD.t - PAD.b) * (1 - i / ticks)
    lineas.push({ v, y })
  }
  return lineas
}

export function TrendChart({ semanas }) {
  // semanas: [{fecha_fin, valor, premios, preliminar}]
  const max = Math.max(...semanas.map((s) => Math.max(s.valor || 0, s.premios || 0)), 1)
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const grupo = innerW / semanas.length
  const barW = Math.min(grupo * 0.36, 26)
  const y = (v) => PAD.t + innerH * (1 - v / max)
  return (
    <div className="pstat-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Valor generado y premios por semana">
        <defs>
          <pattern id="pstat-rayas" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--color-surface)" />
            <rect width="3" height="6" fill="var(--color-amber)" />
          </pattern>
        </defs>
        {ejes(max).map((l) => (
          <g key={l.y}>
            <line x1={PAD.l} x2={W - PAD.r} y1={l.y} y2={l.y} className="pstat-grid" />
            <text x={PAD.l - 6} y={l.y + 4} textAnchor="end" className="pstat-axis">
              {k(l.v)}
            </text>
          </g>
        ))}
        {semanas.map((s, i) => {
          const cx = PAD.l + grupo * i + grupo / 2
          return (
            <g key={s.fecha_fin}>
              <rect x={cx - barW - 1} y={y(s.valor || 0)} width={barW} height={Math.max(innerH * ((s.valor || 0) / max), 0)} className={s.preliminar ? 'pstat-bar pstat-bar--prelim' : 'pstat-bar'} />
              {s.premios != null && (
                <rect x={cx + 1} y={y(s.premios)} width={barW} height={Math.max(innerH * (s.premios / max), 0)} className={s.preliminar ? 'pstat-bar2 pstat-bar2--prelim' : 'pstat-bar2'} />
              )}
              <text x={cx} y={H - 12} textAnchor="middle" className="pstat-axis">
                {dia(s.fecha_fin)}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="pstat-legend">
        <span>
          <i className="pstat-dot pstat-dot--valor" /> Valor generado
        </span>
        <span>
          <i className="pstat-dot pstat-dot--premios" /> Premios
        </span>
        {semanas.some((s) => s.preliminar) && (
          <span>
            <i className="pstat-dot pstat-dot--prelim" /> Preliminar (semana abierta o en revisión)
          </span>
        )}
      </div>
    </div>
  )
}

export function LineChart({ puntos, formato }) {
  // puntos: [{fecha_fin, valor|null, preliminar}]
  const validos = puntos.filter((p) => p.valor != null)
  const max = Math.max(...validos.map((p) => p.valor), 1) * 1.15
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const paso = innerW / Math.max(puntos.length - 1, 1)
  const xy = (p, i) => [PAD.l + paso * i, PAD.t + innerH * (1 - p.valor / max)]
  const trazo = puntos
    .map((p, i) => (p.valor == null ? null : xy(p, i)))
    .reduce((acc, pt) => {
      if (!pt) acc.push(null)
      else if (acc.length && acc[acc.length - 1]) acc[acc.length - 1].push(pt)
      else acc.push([pt])
      return acc
    }, [])
    .filter(Boolean)
  return (
    <div className="pstat-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Premios sobre valor generado por semana">
        {ejes(max).map((l) => (
          <g key={l.y}>
            <line x1={PAD.l} x2={W - PAD.r} y1={l.y} y2={l.y} className="pstat-grid" />
            <text x={PAD.l - 6} y={l.y + 4} textAnchor="end" className="pstat-axis">
              {formato(l.v)}
            </text>
          </g>
        ))}
        {trazo.map((seg, i) => (
          <polyline key={i} points={seg.map((p) => p.join(',')).join(' ')} className="pstat-line" />
        ))}
        {puntos.map((p, i) => {
          if (p.valor == null) return null
          const [x, yy] = xy(p, i)
          return (
            <g key={p.fecha_fin}>
              <circle cx={x} cy={yy} r="4.5" className={p.preliminar ? 'pstat-punto pstat-punto--prelim' : 'pstat-punto'} />
              <text x={x} y={yy - 9} textAnchor="middle" className="pstat-etiqueta">
                {formato(p.valor)}
              </text>
            </g>
          )
        })}
        {puntos.map((p, i) => (
          <text key={p.fecha_fin} x={PAD.l + paso * i} y={H - 12} textAnchor="middle" className="pstat-axis">
            {dia(p.fecha_fin)}
          </text>
        ))}
      </svg>
      {puntos.some((p) => p.preliminar && p.valor != null) && (
        <div className="pstat-legend">
          <span>
            <i className="pstat-dot pstat-dot--prelim" /> Punto hueco: preliminar
          </span>
        </div>
      )}
    </div>
  )
}
