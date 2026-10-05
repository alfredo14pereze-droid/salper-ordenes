// V133 — catálogo de productos por cliente: cómo se copia un producto a una
// prenda de la orden. Es una COPIA (snapshot): la prenda queda con sus propios
// datos dentro de orders.items, así que editar el catálogo después no cambia
// órdenes ya creadas, y editar la prenda en la orden no toca el catálogo.

// "Pecho izquierdo (Logo del colegio), Manga derecha (Letras…)" — el texto
// que va en "¿Dónde va el bordado?" de la prenda.
export function textoBordados(bordados) {
  return (bordados || [])
    .map((b) => {
      const ubicacion = String(b?.ubicacion || '').trim()
      const descripcion = String(b?.descripcion || '').trim()
      if (ubicacion && descripcion) return `${ubicacion} (${descripcion})`
      return ubicacion || descripcion
    })
    .filter(Boolean)
    .join(', ')
}

// Bordados de una prenda de la orden: [{ id, ubicacion, foto_url, foto_path }].
// Una prenda vieja que solo trae el texto de V131 (bordado_ubicacion) se
// muestra como un bordado sin foto, para no perder lo capturado.
export function bordadosDePrenda(item) {
  if (item?.bordados?.length > 0) return item.bordados
  const texto = String(item?.bordado_ubicacion || '').trim()
  return texto ? [{ id: 'ubicacion-v131', ubicacion: texto, foto_url: '', foto_path: '' }] : []
}

export const textoUbicaciones = (bordados) =>
  (bordados || []).map((b) => String(b?.ubicacion || '').trim()).filter(Boolean).join(', ')

// Mensaje de error (o null): toda prenda que "lleva bordado" necesita al menos
// una foto de bordado. Solo se exige al CREAR la orden.
export function validarFotosBordado(items) {
  for (const [n, item] of (items || []).entries()) {
    if (!item?.lleva_bordado) continue
    if (!bordadosDePrenda(item).some((b) => b.foto_url)) {
      return `${String(item.garment || '').trim() || `Prenda ${n + 1}`}: lleva bordado, agrega la foto del bordado.`
    }
  }
  return null
}

// V134 — mensaje de error (o null): toda prenda que "lleva impresión" necesita
// al menos una impresión, y cada una su foto y dónde va (así terminado sabe
// qué imprimir y en qué parte). Solo se exige al CREAR la orden.
export function validarImpresiones(items) {
  for (const [n, item] of (items || []).entries()) {
    if (!item?.lleva_impresion) continue
    const nombre = String(item.garment || '').trim() || `Prenda ${n + 1}`
    const impresiones = item.impresiones || []
    if (impresiones.length === 0) return `${nombre}: lleva impresión, agrega la foto de la impresión.`
    for (const i of impresiones) {
      if (!i.foto_url) return `${nombre}: falta la foto de una impresión.`
      if (!String(i.ubicacion || '').trim()) return `${nombre}: falta indicar dónde va una de las impresiones.`
    }
  }
  return null
}

// Lo que se le aplica a la prenda al elegir un producto. Las tallas NO se
// cargan (pedido explícito: se capturan a mano, como siempre). Los bordados
// del producto se copian a la prenda con su foto del logotipo, si la tiene.
// `conBordado` = false en sublimación, que nunca lleva bordado (V40).
export function prendaDesdeProducto(producto, { telas = [], conBordado = true } = {}) {
  const esp = producto.especificaciones || {}
  const tela = telas.find((t) => t.id === producto.tela_id)
  const bordados = conBordado
    ? (producto.bordados || [])
        .map((b) => ({
          id: crypto.randomUUID(),
          ubicacion: textoBordados([b]),
          foto_url: b?.foto_url || '',
          foto_path: b?.foto_path || '',
        }))
        .filter((b) => b.ubicacion || b.foto_url)
    : []

  return {
    producto_id: producto.id,
    producto_nombre: producto.nombre,
    garment: producto.garment || '',
    color: producto.color || '',
    pantone: producto.pantone || '',
    tela_id: producto.tela_id || '',
    tela_nombre: tela?.nombre || '',
    foto_url: producto.foto_url || '',
    manga: esp.manga || '',
    vivos: esp.vivos || '',
    cuello: esp.cuello || '',
    punos: esp.punos || '',
    observaciones: esp.observaciones || '',
    ...(conBordado ? { lleva_bordado: bordados.length > 0, bordados, bordado_ubicacion: textoUbicaciones(bordados) } : {}),
  }
}

// Texto corto bajo el nombre del producto: "Playera polo · Blanco · Pique".
export function resumenProducto(producto, telas = []) {
  const tela = telas.find((t) => t.id === producto.tela_id)
  return [producto.garment, producto.color, tela?.nombre].filter(Boolean).join(' · ')
}
