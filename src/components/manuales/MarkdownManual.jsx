import { useMemo } from 'react'
import { parseMarkdown, parseInline } from '../../utils/markdownManual'

// V196 — pinta el markdown de un manual como elementos de React (sin HTML
// crudo). Estilos en .manual-md (index.css).
function Inline({ texto }) {
  return parseInline(texto).map((p, i) => {
    if (p.t === 'negrita') return <strong key={i}>{p.v}</strong>
    if (p.t === 'cursiva') return <em key={i}>{p.v}</em>
    if (p.t === 'codigo') return <code key={i}>{p.v}</code>
    if (p.t === 'liga') {
      const externa = /^https?:/i.test(p.href)
      return (
        <a key={i} href={p.href} {...(externa ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {p.v}
        </a>
      )
    }
    return <span key={i}>{p.v}</span>
  })
}

function Renglones({ partes }) {
  return partes.map((t, k) => (
    <span key={k} className={k > 0 ? 'manual-md__cont' : undefined}>
      <Inline texto={t} />
    </span>
  ))
}

function Bloques({ bloques }) {
  return bloques.map((b, i) => {
    switch (b.tipo) {
      case 'titulo': {
        const Tag = `h${Math.min(b.nivel + 1, 5)}` // # → h2 (el h1 es el título del manual)
        return <Tag key={i}><Inline texto={b.texto} /></Tag>
      }
      case 'pasos':
        return (
          <ol key={i} className="manual-md__pasos" start={b.inicio !== 1 ? b.inicio : undefined} style={{ counterReset: `paso ${b.inicio - 1}` }}>
            {b.items.map((it, k) => <li key={k}><Renglones partes={it} /></li>)}
          </ol>
        )
      case 'vinetas':
        return (
          <ul key={i} className="manual-md__vinetas">
            {b.items.map((it, k) => <li key={k}><Renglones partes={it} /></li>)}
          </ul>
        )
      case 'nota':
        return <div key={i} className="manual-md__nota"><Bloques bloques={b.bloques} /></div>
      case 'tabla':
        return (
          <div key={i} className="manual-md__tabla-wrap">
            <table className="manual-md__tabla">
              {b.encabezado && (
                <thead><tr>{b.encabezado.map((c, k) => <th key={k}><Inline texto={c} /></th>)}</tr></thead>
              )}
              <tbody>
                {b.filas.map((f, k) => (
                  <tr key={k}>{f.map((c, j) => <td key={j} data-col={b.encabezado?.[j] || undefined}><Inline texto={c} /></td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case 'linea':
        return <hr key={i} />
      default:
        return <p key={i}><Inline texto={b.texto} /></p>
    }
  })
}

export default function MarkdownManual({ texto }) {
  const bloques = useMemo(() => parseMarkdown(texto), [texto])
  if (!bloques.length) return <p className="manual-md__vacio">Este manual todavía no tiene contenido.</p>
  return (
    <div className="manual-md">
      <Bloques bloques={bloques} />
    </div>
  )
}
