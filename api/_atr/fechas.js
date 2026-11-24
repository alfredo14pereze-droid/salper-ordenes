// Fechas de las órdenes de compra de ATR (Autosistemas de Torreón). Vienen en
// formato de Estados Unidos: MES/DÍA/AÑO ("11/10/2026" = 10 de noviembre).
// Claude solo copia el texto tal cual y aquí se convierte, para no depender
// de que el modelo voltee bien el día y el mes. Sin dependencias; pruebas en
// fechas.test.js.

const MESES = {
  jan: 1, january: 1, ene: 1, enero: 1,
  feb: 2, february: 2, febrero: 2,
  mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, june: 6, junio: 6,
  jul: 7, july: 7, julio: 7,
  aug: 8, august: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, septiembre: 9, set: 9,
  oct: 10, october: 10, octubre: 10,
  nov: 11, november: 11, noviembre: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12,
}

const iso = (y, m, d) => {
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  const f = new Date(Date.UTC(y, m - 1, d))
  if (f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null // 31 de febrero, etc.
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Texto de la OC → 'AAAA-MM-DD' (o null si no se entiende).
//   "11/10/2026", "11-10-2026", "11.10.26"  → mes/día/año
//   "Nov 10, 2026", "10 Nov 2026", "November 10 2026"
//   "2026-11-10" (ya viene en ISO)
export function fechaAtr(texto) {
  const t = String(texto ?? '').trim().toLowerCase()
  if (!t) return null
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = t.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return iso(y, +m[1], +m[2]) // MES / DÍA / AÑO
  }
  m = t.match(/^([a-záéíóú]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m && MESES[m[1]]) return iso(+m[3], MESES[m[1]], +m[2])
  m = t.match(/^(\d{1,2})\s*(?:de\s+)?([a-záéíóú]+)\.?,?\s*(?:de\s+)?(\d{4})$/)
  if (m && MESES[m[2]]) return iso(+m[3], MESES[m[2]], +m[1])
  return null
}

// Fecha de entrega: la del PDF; si no se lee pero sí "Días para entregar",
// se calcula desde la fecha de la orden. Si las dos vienen y no cuadran con
// los días, gana la del PDF (se avisa en pantalla igual que siempre).
export function fechasOcAtr({ fecha_oc_texto, fecha_entrega_texto, dias_para_entregar }) {
  const fechaOc = fechaAtr(fecha_oc_texto)
  let fechaEntrega = fechaAtr(fecha_entrega_texto)
  const dias = Number(dias_para_entregar)
  if (!fechaEntrega && fechaOc && Number.isInteger(dias) && dias > 0 && dias < 400) {
    const f = new Date(`${fechaOc}T00:00:00Z`)
    f.setUTCDate(f.getUTCDate() + dias)
    fechaEntrega = f.toISOString().slice(0, 10)
  }
  return { fechaOc, fechaEntrega }
}
