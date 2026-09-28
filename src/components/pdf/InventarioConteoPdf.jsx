import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import logo from '../../assets/salper-logo.png'
import { formatTalla } from '../../utils/inventarioTallas'

// Hoja de conteo físico imprimible (V89): Prenda/Talla/Sistema/Conteo(en
// blanco, para llenar a mano). Mismo estilo visual que RemisionPdf.jsx.

const COLOR_INK = '#1a1a1a'
const COLOR_MUTED = '#6b6558'
const COLOR_BORDER = '#dcd6c8'
const COLOR_AMBER = '#ffc93c'
const COLOR_ORANGE = '#e8720c'

const styles = StyleSheet.create({
  page: { backgroundColor: '#ffffff', color: COLOR_INK, fontFamily: 'Helvetica', fontSize: 9.5, padding: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  logo: { width: 70, height: 70, objectFit: 'contain' },
  headerRight: { alignItems: 'flex-end' },
  docTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: COLOR_MUTED, letterSpacing: 1 },
  titleBox: { backgroundColor: COLOR_AMBER, paddingVertical: 5, paddingHorizontal: 14, marginTop: 6 },
  titleValue: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: COLOR_INK },

  section: { marginBottom: 10 },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: COLOR_ORANGE,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    borderBottom: `1pt solid ${COLOR_BORDER}`,
    paddingBottom: 4,
  },

  table: { border: `1pt solid ${COLOR_BORDER}`, borderRadius: 3 },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: '#f4f0e6', borderBottom: `1pt solid ${COLOR_BORDER}` },
  tableRow: { flexDirection: 'row', borderBottom: `0.8pt solid ${COLOR_BORDER}` },
  tableRow_last: { borderBottom: 'none' },
  cellPrenda: { width: '40%', padding: 6, fontSize: 8.5 },
  cellTalla: { width: '15%', padding: 6, fontSize: 8.5, textAlign: 'center' },
  cellSistema: { width: '20%', padding: 6, fontSize: 8.5, textAlign: 'center' },
  cellConteo: { width: '25%', padding: 10, fontSize: 8.5, textAlign: 'center', borderLeft: `1pt solid ${COLOR_BORDER}` },
  headerCell: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.3 },

  footnote: {
    marginTop: 18,
    fontSize: 8,
    fontStyle: 'italic',
    color: COLOR_MUTED,
    textAlign: 'center',
    borderTop: `1pt solid ${COLOR_BORDER}`,
    paddingTop: 10,
  },
})

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function InventarioConteoPdf({ seccionNombre, ubicacionNombre, fecha, lineas }) {
  return (
    <Document title={`Inventario ${seccionNombre} · SALPER`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Image src={logo} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>CONTEO FÍSICO DE INVENTARIO</Text>
            <View style={styles.titleBox}>
              <Text style={styles.titleValue}>
                Inventario {seccionNombre} {formatDate(fecha)}
              </Text>
            </View>
            <Text style={{ fontSize: 8, color: COLOR_MUTED, marginTop: 4 }}>Ubicación: {ubicacionNombre}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prendas</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.cellPrenda, styles.headerCell]}>Prenda</Text>
              <Text style={[styles.cellTalla, styles.headerCell]}>Talla</Text>
              <Text style={[styles.cellSistema, styles.headerCell]}>Sistema</Text>
              <Text style={[styles.cellConteo, styles.headerCell]}>Conteo</Text>
            </View>
            {lineas.map((l, i) => (
              <View key={l.linea_id || i} style={[styles.tableRow, i === lineas.length - 1 && styles.tableRow_last]}>
                <Text style={styles.cellPrenda}>{l.prenda}</Text>
                <Text style={styles.cellTalla}>{formatTalla(l.talla)}</Text>
                <Text style={styles.cellSistema}>{l.sistema}</Text>
                <Text style={styles.cellConteo}> </Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.footnote}>Llenar la columna "Conteo" a mano y capturar después en SALPER</Text>
      </Page>
    </Document>
  )
}
