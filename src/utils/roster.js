// Roster de nombres y números (V39, simplificado en V126): una fila por
// jugador — talla, nombre y número. Las filas en blanco no se guardan, y
// `tiene_roster` se calcula solo (hay al menos una fila con datos), así que
// ya no depende de que alguien apriete un botón.
export const FILA_ROSTER_VACIA = { talla: '', nombre: '', numero: '' }

// Una fila cuenta cuando trae nombre o número: la talla sola no es un
// registro (las filas nuevas heredan la talla de la anterior).
export function filaRosterConDatos(r) {
  return !!(String(r?.nombre ?? '').trim() || String(r?.numero ?? '').trim())
}

// Devuelve la prenda con el roster limpio (sin filas vacías, textos sin
// espacios sobrantes). Si no trae roster, la regresa tal cual.
export function limpiarRoster(item) {
  if (!Array.isArray(item.roster) || item.roster.length === 0) return item
  const roster = item.roster
    .filter(filaRosterConDatos)
    .map((r) => ({
      talla: String(r.talla ?? '').trim(),
      nombre: String(r.nombre ?? '').trim(),
      numero: String(r.numero ?? '').trim(),
    }))
  return { ...item, roster, tiene_roster: roster.length > 0 }
}

// Filas con datos del roster de una prenda (vacío si no lleva lista).
export function rosterDePrenda(item) {
  if (!item?.tiene_roster || !Array.isArray(item.roster)) return []
  return item.roster.filter(filaRosterConDatos)
}

// Texto para copiar y pegar en el programa de diseño o en una hoja de
// cálculo: una fila por renglón. 'lista' = nombre, talla y número separados
// por tabulador (cada dato cae en su columna); 'nombres' y 'numeros' = solo
// esa columna, en el mismo orden.
export function textoRoster(filas, modo = 'lista') {
  const limpio = (v) => String(v ?? '').trim()
  return (filas || [])
    .map((r) =>
      modo === 'nombres' ? limpio(r.nombre) : modo === 'numeros' ? limpio(r.numero) : [limpio(r.nombre), limpio(r.talla), limpio(r.numero)].join('\t')
    )
    .join('\n')
}
