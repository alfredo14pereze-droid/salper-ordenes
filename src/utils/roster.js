// Roster de nombres y números (V39, simplificado en V126): una fila por
// jugador — talla, nombre y número. Las filas en blanco no se guardan, y
// `tiene_roster` se calcula solo (hay al menos una fila con datos), así que
// ya no depende de que alguien apriete un botón.
export const FILA_ROSTER_VACIA = { talla: '', nombre: '', numero: '' }

export function filaRosterConDatos(r) {
  return !!(String(r?.talla ?? '').trim() || String(r?.nombre ?? '').trim() || String(r?.numero ?? '').trim())
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
