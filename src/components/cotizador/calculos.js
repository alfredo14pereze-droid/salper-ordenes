import { COSTO_POR_SEGUNDO, MINUTOS_EFECTIVOS_DIA, MAX_OPERADORAS } from '../../config/costos.js'

// Cálculo puro del cotizador de destajo (no guarda nada).

// Operaciones de una prenda agrupadas por PARTE, en el orden del primer folio
// de cada parte: [{ parte, operaciones }].
export function agruparPorParte(ops) {
  const grupos = new Map()
  for (const o of [...ops].sort((a, b) => a.folio - b.folio)) {
    if (!grupos.has(o.parte)) grupos.set(o.parte, [])
    grupos.get(o.parte).push(o)
  }
  return [...grupos.entries()].map(([parte, operaciones]) => ({ parte, operaciones }))
}

// Tiempo 0, vacío o inválido = la operación no tiene precio.
export function sinTiempo(o) {
  const s = Number(o?.segundos)
  return !Number.isFinite(s) || s <= 0
}

function segundosDe(o) {
  return sinTiempo(o) ? 0 : Number(o.segundos)
}

// Piezas: entero > 0. Operadoras: entero de 1 a MAX_OPERADORAS.
export function validarPiezas(valor) {
  const n = Number(valor)
  if (valor === '' || valor == null) return 'Captura las piezas.'
  if (!Number.isInteger(n) || n <= 0) return 'Las piezas deben ser un número entero mayor que 0.'
  return null
}
export function validarOperadoras(valor, max = MAX_OPERADORAS) {
  const n = Number(valor)
  if (valor === '' || valor == null) return 'Captura las operadoras.'
  if (!Number.isInteger(n) || n < 1 || n > max) return `Las operadoras deben ser un número entero de 1 a ${max}.`
  return null
}

// Evita que 3.0000000000004 se convierta en 4 días al redondear hacia arriba.
function techo(x) {
  return Math.ceil(Math.round(x * 1e6) / 1e6)
}

// seleccionadas: operaciones marcadas. piezas/operadoras: números ya validados
// (si no lo son, cuentan como 0 y los días quedan en 0, sin dividir entre 0).
export function cotizar(seleccionadas, piezas, operadoras, { costoPorSegundo = COSTO_POR_SEGUNDO, minutosDia = MINUTOS_EFECTIVOS_DIA } = {}) {
  const p = validarPiezas(piezas) ? 0 : Number(piezas)
  const ops = Number(operadoras)
  const opsValidas = validarOperadoras(operadoras) ? 0 : ops

  const filas = [...seleccionadas]
    .sort((a, b) => a.folio - b.folio)
    .map((o) => {
      const tiempo = segundosDe(o)
      const precio = tiempo * costoPorSegundo
      return { folio: o.folio, parte: o.parte, operacion: o.operacion, tiempo, precio, costoLote: precio * p, aviso: sinTiempo(o) }
    })

  const segundosPorPieza = filas.reduce((s, f) => s + f.tiempo, 0)
  const costoUnitario = segundosPorPieza * costoPorSegundo
  const costoTotalLote = costoUnitario * p
  const minutosPorPieza = segundosPorPieza / 60
  const tiempoTotalMin = minutosPorPieza * p
  const diasProduccion = opsValidas > 0 ? tiempoTotalMin / (opsValidas * minutosDia) : 0

  return {
    filas,
    totales: {
      segundosPorPieza,
      costoUnitario,
      costoTotalLote,
      minutosPorPieza,
      tiempoTotalMin,
      operadoras: opsValidas,
      diasProduccion,
      diasEnteros: techo(diasProduccion),
    },
    conAviso: filas.filter((f) => f.aviso).length,
  }
}

// V172 — una cotización guardada, recalculada con SUS números (los segundos,
// el precio por segundo y los minutos por día de ese día).
export function cotizarGuardada(c) {
  return cotizar(c.operaciones || [], String(c.piezas), String(c.operadoras), {
    costoPorSegundo: Number(c.costo_por_segundo),
    minutosDia: Number(c.minutos_dia),
  })
}

// Para "Volver a cotizar": qué folios de la guardada siguen activos hoy en el
// catálogo de esa prenda y cuántos ya no están.
export function foliosVigentes(c, opsActivas) {
  const hoy = new Set(opsActivas.filter((o) => o.prenda === c.prenda).map((o) => o.folio))
  const folios = (c.operaciones || []).map((o) => o.folio)
  const vigentes = folios.filter((f) => hoy.has(f))
  return { vigentes, faltan: folios.length - vigentes.length }
}
