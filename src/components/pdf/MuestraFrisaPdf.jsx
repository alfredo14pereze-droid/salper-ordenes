import { View, Font } from '@react-pdf/renderer'
import { colorProductoFrisa } from '../../utils/frisaColores'

// Sin cortar palabras con guion ("COR-TA"), igual que ProduccionPdf.
Font.registerHyphenationCallback((palabra) => [palabra])

// Muestra del color del producto Frisa en los PDF (igual que la etiqueta de estantería):
// cuadrito del color y franja plateada si lleva reflejante.
export default function MuestraFrisaPdf({ producto }) {
  const c = colorProductoFrisa(producto)
  if (!c || c.sinMuestra) return null
  return (
    <View style={{ width: 7, height: 9, marginRight: 4, marginTop: 0.5, borderRadius: 1.5, backgroundColor: c.hex, border: c.hex === '#FFFFFF' ? '0.5pt solid #9AA3AE' : undefined, justifyContent: 'center' }}>
      {c.reflejante && <View style={{ height: 2, backgroundColor: '#D7DCE3', borderTop: '0.4pt solid #8C96A3', borderBottom: '0.4pt solid #8C96A3' }} />}
    </View>
  )
}

// Estilo del texto en el color del producto (negritas, tono oscuro sobre el claro).
export function estiloTextoFrisa(producto) {
  const c = colorProductoFrisa(producto)
  if (!c) return null
  return { fontFamily: 'Helvetica-Bold', color: c.texto, backgroundColor: c.fondo }
}
