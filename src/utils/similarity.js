// Distancia de Levenshtein simple, sin dependencias — se usa solo para el
// aviso suave de "cliente parecido" al crear uno nuevo (ver
// ClienteSelect.jsx). El duplicado EXACTO ya lo bloquea el índice único en
// la base (create_cliente); esto es nada más una ayuda visual, nunca
// bloquea.
function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const prev = new Array(n + 1)
  const curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return prev[n]
}

// 1 = idénticos, 0 = completamente distintos.
export function similarity(a, b) {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (!x || !y) return 0
  const maxLen = Math.max(x.length, y.length)
  return 1 - levenshtein(x, y) / maxLen
}

// Regresa el más parecido de la lista si supera el umbral, o null.
export function findSimilar(name, candidates, threshold = 0.75) {
  let best = null
  let bestScore = threshold
  for (const candidate of candidates) {
    const score = similarity(name, candidate)
    if (score >= bestScore && score < 1) {
      best = candidate
      bestScore = score
    }
  }
  return best
}
