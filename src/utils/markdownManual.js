// V196 — Manuales: lector de markdown sencillo, sin dependencias.
// Convierte el texto a una lista de bloques que MarkdownManual.jsx pinta
// como elementos de React (nunca HTML crudo, así no hay riesgo de inyectar
// código desde el contenido).
//
// Soporta lo que usan los manuales:
//   # / ## / ### títulos          1. pasos numerados      - viñetas
//   > nota (se ve como recuadro)  | tabla | simple |       --- línea
//   **negritas**, *cursivas*, `código`, [texto](https://liga)
// Un renglón con sangría debajo de un paso o viñeta se pega a ese paso.

const RE_TITULO = /^(#{1,4})\s+(.*)$/
const RE_NUM = /^\s{0,3}(\d+)[.)]\s+(.*)$/
const RE_VINETA = /^\s{0,3}[-*•]\s+(.*)$/
const RE_NOTA = /^\s{0,3}>\s?(.*)$/
const RE_LINEA = /^\s{0,3}(-{3,}|\*{3,})\s*$/
const RE_TABLA = /^\s*\|.*\|\s*$/
const RE_SEPARADOR_TABLA = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function celdas(linea) {
  return linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

export function parseMarkdown(texto) {
  const lineas = String(texto || '').replace(/\r\n?/g, '\n').split('\n')
  const bloques = []
  let i = 0
  while (i < lineas.length) {
    const l = lineas[i]
    if (!l.trim()) { i++; continue }

    let m
    if ((m = l.match(RE_TITULO))) {
      bloques.push({ tipo: 'titulo', nivel: m[1].length, texto: m[2].trim() })
      i++
      continue
    }
    if (RE_LINEA.test(l)) {
      bloques.push({ tipo: 'linea' })
      i++
      continue
    }
    if (RE_TABLA.test(l)) {
      const filas = []
      while (i < lineas.length && RE_TABLA.test(lineas[i])) {
        if (!RE_SEPARADOR_TABLA.test(lineas[i])) filas.push(celdas(lineas[i]))
        i++
      }
      const [encabezado, ...cuerpo] = filas
      bloques.push({ tipo: 'tabla', encabezado, filas: cuerpo })
      continue
    }
    if (RE_NOTA.test(l)) {
      const partes = []
      while (i < lineas.length && RE_NOTA.test(lineas[i])) {
        partes.push(lineas[i].match(RE_NOTA)[1])
        i++
      }
      bloques.push({ tipo: 'nota', bloques: parseMarkdown(partes.join('\n')) })
      continue
    }
    const esNum = RE_NUM.test(l)
    if (esNum || RE_VINETA.test(l)) {
      const re = esNum ? RE_NUM : RE_VINETA
      const items = []
      const inicio = esNum ? Number(l.match(RE_NUM)[1]) : 1
      while (i < lineas.length) {
        const actual = lineas[i]
        const mi = actual.match(re)
        if (mi) {
          items.push([esNum ? mi[2] : mi[1]])
          i++
          continue
        }
        // Renglón con sangría (o continuación pegada) = sigue el mismo paso.
        if (actual.trim() && /^\s{2,}/.test(actual) && items.length) {
          items[items.length - 1].push(actual.trim())
          i++
          continue
        }
        // Un renglón en blanco entre pasos no corta la lista.
        if (!actual.trim() && i + 1 < lineas.length && re.test(lineas[i + 1])) {
          i++
          continue
        }
        break
      }
      bloques.push({ tipo: esNum ? 'pasos' : 'vinetas', inicio, items })
      continue
    }
    // Párrafo: hasta un renglón en blanco o el inicio de otro bloque.
    const partes = [l.trim()]
    i++
    while (
      i < lineas.length && lineas[i].trim() &&
      !RE_TITULO.test(lineas[i]) && !RE_NUM.test(lineas[i]) && !RE_VINETA.test(lineas[i]) &&
      !RE_NOTA.test(lineas[i]) && !RE_TABLA.test(lineas[i]) && !RE_LINEA.test(lineas[i])
    ) {
      partes.push(lineas[i].trim())
      i++
    }
    bloques.push({ tipo: 'parrafo', texto: partes.join(' ') })
  }
  return bloques
}

// Texto en línea → lista de piezas { t: 'texto'|'negrita'|'cursiva'|'codigo'|'liga', v, href? }.
const RE_INLINE = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*)\*)/g

export function parseInline(texto) {
  const piezas = []
  const s = String(texto || '')
  let ultimo = 0
  let m
  RE_INLINE.lastIndex = 0
  while ((m = RE_INLINE.exec(s))) {
    if (m.index > ultimo) piezas.push({ t: 'texto', v: s.slice(ultimo, m.index) })
    if (m[2] != null) piezas.push({ t: 'negrita', v: m[2] })
    else if (m[3] != null) piezas.push({ t: 'codigo', v: m[3] })
    else if (m[4] != null) {
      // Solo ligas http(s) o internas de la app (#/...). Lo demás queda como texto.
      const href = m[5]
      if (/^(https?:\/\/|#\/)/i.test(href)) piezas.push({ t: 'liga', v: m[4], href })
      else piezas.push({ t: 'texto', v: m[4] })
    } else if (m[6] != null) piezas.push({ t: 'cursiva', v: m[6] })
    ultimo = m.index + m[0].length
  }
  if (ultimo < s.length) piezas.push({ t: 'texto', v: s.slice(ultimo) })
  return piezas
}

// Texto plano (sin marcas) para el buscador y los fragmentos de resultado.
export function textoPlano(markdown) {
  return String(markdown || '')
    .replace(/^\s{0,3}(#{1,4}|>|\d+[.)]|[-*•])\s+/gm, '')
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\*\*|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(^|\s)\*([^*]+)\*/g, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
