import { calcularHorasHabiles } from './horasHabiles.js'

// V140 — pausas de una etapa. La fila de orden_etapas trae `pausada_en`
// (la pausa abierta, si la hay), `pausas` (las ya cerradas, [{inicio, fin}])
// y `tiempo_pausado_ms` (su suma). Sin el SQL de V140 esas columnas no
// existen y todo esto devuelve "sin pausas".

export function estaPausada(etapa) {
  return etapa?.estado === 'en_proceso' && !!etapa.pausada_en
}

// La estación solo puede pausar si la base ya tiene las columnas de V140.
export function soportaPausa(etapa) {
  return !!etapa && 'pausada_en' in etapa
}

// Tramos en pausa como [inicioMs, finMs], recortados a la vida de la etapa
// (de su inicio a su fin, o a `hasta` si sigue en proceso). La pausa abierta
// cuenta hasta `hasta`.
export function tramosEnPausa(etapa, hasta = Date.now()) {
  const inicio = etapa?.iniciado_en ? new Date(etapa.iniciado_en).getTime() : null
  if (inicio == null) return []
  const fin = etapa.completado_en ? new Date(etapa.completado_en).getTime() : new Date(hasta).getTime()
  const crudos = (Array.isArray(etapa.pausas) ? etapa.pausas : []).map((p) => [new Date(p.inicio).getTime(), new Date(p.fin).getTime()])
  if (etapa.pausada_en && !etapa.completado_en) crudos.push([new Date(etapa.pausada_en).getTime(), fin])
  return crudos
    .map(([a, b]) => [Math.max(a, inicio), Math.min(b, fin)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
}

// Milisegundos de reloj trabajados: de corrido menos las pausas.
export function msTrabajados(etapa, hasta = Date.now()) {
  if (!etapa?.iniciado_en) return 0
  const inicio = new Date(etapa.iniciado_en).getTime()
  const fin = etapa.completado_en ? new Date(etapa.completado_en).getTime() : new Date(hasta).getTime()
  const pausado = tramosEnPausa(etapa, hasta).reduce((s, [a, b]) => s + (b - a), 0)
  return Math.max(fin - inicio - pausado, 0)
}

// Minutos hábiles trabajados: los hábiles de corrido menos los hábiles de
// cada pausa (una pausa de noche o en fin de semana no descuenta nada).
export function minutosHabilesTrabajados(etapa, hasta = Date.now()) {
  if (!etapa?.iniciado_en) return 0
  const fin = etapa.completado_en || new Date(hasta)
  const brutos = calcularHorasHabiles(etapa.iniciado_en, fin)
  const pausados = tramosEnPausa(etapa, hasta).reduce((s, [a, b]) => s + calcularHorasHabiles(new Date(a), new Date(b)), 0)
  return Math.max(brutos - pausados, 0)
}
