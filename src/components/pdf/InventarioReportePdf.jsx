import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import logo from '../../assets/salper-logo.png'
import { formatTalla } from '../../utils/inventarioTallas'

// Reporte de inventario por colegio (V92): todas las prendas o una sola,
// en 3 modos — una ubicación específica, consolidado (total), o
// consolidado detallando cada almacén. Mismo estilo visual que los demás
// PDFs de Inventario/SALPER.

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
  cell: { padding: 6, fontSize: 8.5 },
  cellCenter: { padding: 6, fontSize: 8.5, textAlign: 'center' },
  cellTotal: { padding: 6, fontSize: 8.5, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
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

// Arma las columnas de datos (además de Prenda/Talla) según el modo.
function buildColumnas(modo, ubicaciones, ubicacionSeleccionada) {
  if (modo === 'ubicacion') {
    return [{ label: ubicacionSeleccionada.nombre, get: (f) => f.porUbicacion[ubicacionSeleccionada.id] ?? 0, total: false }]
  }
  if (modo === 'detallado') {
    return [
      ...ubicaciones.map((u) => ({ label: u.nombre, get: (f) => f.porUbicacion[u.id] ?? 0, total: false })),
      { label: 'Total', get: (f) => f.total, total: true },
    ]
  }
  // consolidado
  return [{ label: 'Total', get: (f) => f.total, total: true }]
}

export default function InventarioReportePdf({ seccionNombre, prendaFiltro, fecha, filas, modo, ubicaciones, ubicacionSeleccionada }) {
  const columnas = buildColumnas(modo, ubicaciones, ubicacionSeleccionada)
  const colPct = 100 - 30 - 15 // resto después de Prenda (30%) y Talla (15%)
  const eachPct = colPct / columnas.length
  const subtitulo = prendaFiltro ? prendaFiltro : 'Todas las prendas'

  return (
    <Document title={`Reporte de inventario ${seccionNombre} · SALPER`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Image src={logo} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>REPORTE DE INVENTARIO</Text>
            <View style={styles.titleBox}>
              <Text style={styles.titleValue}>{seccionNombre}</Text>
            </View>
            <Text style={{ fontSize: 8, color: COLOR_MUTED, marginTop: 4 }}>
              {subtitulo} · {formatDate(fecha)}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Existencias</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.cell, styles.headerCell, { width: '30%' }]}>Prenda</Text>
              <Text style={[styles.cellCenter, styles.headerCell, { width: '15%' }]}>Talla</Text>
              {columnas.map((c) => (
                <Text key={c.label} style={[styles.cellCenter, styles.headerCell, { width: `${eachPct}%` }]}>
                  {c.label}
                </Text>
              ))}
            </View>
            {filas.map((f, i) => (
              <View key={`${f.prenda}-${f.tallaOrden}-${i}`} style={[styles.tableRow, i === filas.length - 1 && styles.tableRow_last]}>
                <Text style={[styles.cell, { width: '30%' }]}>{f.prenda}</Text>
                <Text style={[styles.cellCenter, { width: '15%' }]}>{formatTalla(f.talla)}</Text>
                {columnas.map((c) => (
                  <Text key={c.label} style={[c.total ? styles.cellTotal : styles.cellCenter, { width: `${eachPct}%` }]}>
                    {c.get(f)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.footnote}>Reporte generado en SALPER</Text>
      </Page>
    </Document>
  )
}
