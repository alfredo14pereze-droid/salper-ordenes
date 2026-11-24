import { colorHex, textoSobre } from '../../utils/atrColores'

// Ayuda visual de una bata de ATR: el color como etiqueta del mismo color y
// si es con o sin bolsa bien marcado. Acepta { color, con_bolsa } y, si no
// trae color, lo saca del nombre ("Bata con bolsa Azul Cielo").
export function colorDeNombre(nombre) {
  const m = String(nombre || '').match(/bolsa\s+(.+)$/i)
  return m ? m[1] : ''
}
export function bolsaDeNombre(nombre) {
  const t = String(nombre || '').toLowerCase()
  if (t.includes('sin bolsa')) return false
  if (t.includes('con bolsa')) return true
  return null
}

export function AtrColor({ color }) {
  const hex = colorHex(color)
  return (
    <span
      className={'atr-color' + (hex ? '' : ' atr-color--sin')}
      style={hex ? { background: hex, color: textoSobre(hex), borderColor: hex === '#ffffff' ? 'var(--color-border)' : hex } : undefined}
    >
      {color || '—'}
    </span>
  )
}

export function AtrBolsa({ conBolsa }) {
  if (conBolsa === null || conBolsa === undefined) return null
  return conBolsa
    ? <span className="atr-bolsa atr-bolsa--con" title="Con bolsa">● Con bolsa</span>
    : <span className="atr-bolsa atr-bolsa--sin" title="Sin bolsa">○ Sin bolsa</span>
}

// Color + con/sin bolsa (en una sola celda).
export default function AtrBata({ producto, color, conBolsa }) {
  const c = color ?? colorDeNombre(producto)
  const b = conBolsa ?? bolsaDeNombre(producto)
  return (
    <span className="atr-bata" title={producto || undefined}>
      <AtrColor color={c} />
      <AtrBolsa conBolsa={b} />
    </span>
  )
}
