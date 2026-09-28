import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import logo from '../../assets/salper-logo.png'

// Vale de traspaso de inventario (V89, addendum C). Mismo estilo visual que
// RemisionPdf.jsx.

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
  folioBox: { backgroundColor: COLOR_AMBER, paddingVertical: 5, paddingHorizontal: 14, marginTop: 6 },
  folioValue: { fontFamily: 'Helvetica-Bold', fontSize: 20, color: COLOR_INK },

  section: { marginBottom: 16 },
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
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  infoField: { width: '50%', marginBottom: 8, paddingRight: 10 },
  infoLabel: { fontSize: 7.5, color: COLOR_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 10, marginTop: 2 },

  table: { border: `1pt solid ${COLOR_BORDER}`, borderRadius: 3 },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: '#f4f0e6', borderBottom: `1pt solid ${COLOR_BORDER}` },
  tableRow: { flexDirection: 'row', borderBottom: `0.8pt solid ${COLOR_BORDER}` },
  tableRow_last: { borderBottom: 'none' },
  cellPrenda: { width: '50%', padding: 6, fontSize: 8.5 },
  cellTalla: { width: '25%', padding: 6, fontSize: 8.5, textAlign: 'center' },
  cellCantidad: { width: '25%', padding: 6, fontSize: 8.5, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
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

function InfoField({ label, value }) {
  return (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  )
}

export default function InventarioTraspasoPdf({ traspaso, origenNombre, destinoNombre, lineas }) {
  return (
    <Document title={`Traspaso ${traspaso.folio} · SALPER`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Image src={logo} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>VALE DE TRASPASO DE INVENTARIO</Text>
            <View style={styles.folioBox}>
              <Text style={styles.folioValue}>{traspaso.folio}</Text>
            </View>
            <Text style={{ fontSize: 8, color: COLOR_MUTED, marginTop: 4 }}>{formatDate(traspaso.creado_en)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos generales</Text>
          <View style={styles.infoGrid}>
            <InfoField label="Origen" value={origenNombre} />
            <InfoField label="Destino" value={destinoNombre} />
            {traspaso.nota && <InfoField label="Nota" value={traspaso.nota} />}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prendas</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.cellPrenda, styles.headerCell]}>Prenda</Text>
              <Text style={[styles.cellTalla, styles.headerCell]}>Talla</Text>
              <Text style={[styles.cellCantidad, styles.headerCell]}>Cantidad</Text>
            </View>
            {lineas.map((l, i) => (
              <View key={l.articuloId || i} style={[styles.tableRow, i === lineas.length - 1 && styles.tableRow_last]}>
                <Text style={styles.cellPrenda}>{l.prenda}</Text>
                <Text style={styles.cellTalla}>{l.talla}</Text>
                <Text style={styles.cellCantidad}>{l.cantidad}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.footnote}>Vale generado en SALPER al confirmar el traspaso</Text>
      </Page>
    </Document>
  )
}
