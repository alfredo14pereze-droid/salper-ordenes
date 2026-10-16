// V154 — la tela es obligatoria en las órdenes que pasan por corte: sin
// tela, corte no puede registrar lo que usó (pasó con VEN-004 e IND-007).
// El servidor tiene el mismo candado al crear la orden
// (schema_v154_tela_obligatoria.sql); esto es para avisar antes de guardar.

const TIPOS_SIN_TELA = ['maquila', 'bordado'] // maquila: la tela es del cliente; bordado: prendas ya hechas

// ¿Este tipo de orden pasa por corte? (según su plantilla de etapas)
export function tipoLlevaCorte(orderTypeKey, plantillas = []) {
  if (!orderTypeKey || TIPOS_SIN_TELA.includes(orderTypeKey)) return false
  return plantillas.some((p) => p.order_type_key === orderTypeKey && p.etapa === 'corte')
}

const prendaConContenido = (item) =>
  !!item && typeof item === 'object' && (String(item.garment ?? '').trim() !== '' || (item.sizes || []).some((s) => String(s?.talla ?? '').trim()))

// Mensaje de error (o null): la primera prenda que no tiene tela.
export function faltaTela(items = []) {
  const llenas = items.filter(prendaConContenido)
  for (const [i, item] of llenas.entries()) {
    if (!String(item.tela_id ?? '').trim()) {
      const nombre = String(item.garment ?? '').trim() || `Prenda ${i + 1}`
      return `${nombre}: falta elegir la tela. Es obligatoria para que corte pueda registrar lo que usa.`
    }
  }
  return null
}
