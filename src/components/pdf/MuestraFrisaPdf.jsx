import { View } from '@react-pdf/renderer'
import { colorProductoFrisa } from '../../utils/frisaColores'

// Muestra del color del producto Frisa en los PDF (igual que la etiqueta de estantería):
// cuadrito del color y franja plateada si lleva reflejante.
export default function MuestraFrisaPdf({ producto }) {
  const c = colorProductoFrisa(producto)
  if (!c) return null
  return (
    <View style={{ width: 7, height: 9, marginRight: 4, marginTop: 0.5, borderRadius: 1.5, backgroundColor: c.hex, border: c.hex === '#FFFFFF' ? '0.5pt solid #9AA3AE' : undefined, justifyContent: 'center' }}>
      {c.reflejante && <View style={{ height: 2, backgroundColor: '#D7DCE3', borderTop: '0.4pt solid #8C96A3', borderBottom: '0.4pt solid #8C96A3' }} />}
    </View>
  )
}
