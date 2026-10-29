// Entrega masiva (sin UI): marcar varias órdenes como entregadas de una vez.
// Cada orden pasa por entregar_orden (V160), una por una: mismas reglas de
// permisos, precios y registro que el botón del detalle.

// Órdenes que se pueden entregar: no canceladas, no eliminadas, no entregadas.
// soloListas = solo las que ya están en "Terminado" (lista para entregar).
export function ordenesEntregables(orders, { soloListas = true, busqueda = '' } = {}) {
  const q = String(busqueda || '').trim().toLowerCase()
  return (orders || []).filter((o) => {
    if (o.cancelled_at || o.eliminada_en || o.status === 'completado') return false
    if (soloListas && o.status !== 'terminado') return false
    if (!q) return true
    return [o.order_number, o.client_name, o.equipo, o.numero_corte]
      .some((v) => String(v || '').toLowerCase().includes(q))
  })
}

// ¿El error es por requisitos (precio / factura) y se puede forzar?
export function esBloqueoDeRequisitos(mensaje) {
  return /^No se puede marcar como entregada/.test(String(mensaje || ''))
}

// Entrega las órdenes `ids` una por una con `entregar(id, opciones)` (que
// regresa { error }). Nunca se detiene por una que falle.
// Regresa { entregadas: [id], bloqueadas: [{ id, mensaje }], errores: [{ id, mensaje }] }.
export async function entregarVarias(ids, entregar, { forzar = false, motivo = null, onProgreso } = {}) {
  const resultado = { entregadas: [], bloqueadas: [], errores: [] }
  let n = 0
  for (const id of ids) {
    let mensaje = null
    try {
      const { error } = await entregar(id, { forzar, motivo })
      if (error) mensaje = error.message || String(error)
    } catch (e) {
      mensaje = e?.message || String(e)
    }
    if (!mensaje) resultado.entregadas.push(id)
    else if (esBloqueoDeRequisitos(mensaje)) resultado.bloqueadas.push({ id, mensaje })
    else resultado.errores.push({ id, mensaje })
    n += 1
    onProgreso?.(n, ids.length)
  }
  return resultado
}

// "No se puede marcar como entregada. Falta precio en: X." → "Falta precio en: X."
export function motivoBloqueo(mensaje) {
  return String(mensaje || '').replace(/^No se puede marcar como entregada\.\s*/, '')
}
