import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import logo from '../../assets/salper-logo.png'

// Remisión de entrega (V26, Parte 4): compara cantidad pedida vs
// realmente surtida por talla, con codificación de color — negro si son
// iguales, rojo si faltó, verde si sobró — e incluye los comentarios de
// las líneas donde hubo diferencia. Se habilita solo cuando la orden ya
// está "completado". Mismo estilo visual que OrderConfirmationPdf.jsx.

const COLOR_INK = '#1a1a1a'
const COLOR_MUTED = '#6b6558'
const COLOR_BORDER = '#dcd6c8'
const COLOR_AMBER = '#ffc93c'
const COLOR_ORANGE = '#e8720c'
const COLOR_RED = '#c7351f'
const COLOR_GREEN = '#2f8f4e'

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
  cellPrenda: { width: '26%', padding: 6, fontSize: 8.5 },
  cellTalla: { width: '12%', padding: 6, fontSize: 8.5, textAlign: 'center' },
  cellPedida: { width: '14%', padding: 6, fontSize: 8.5, textAlign: 'center' },
  cellSurtida: { width: '14%', padding: 6, fontSize: 8.5, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  cellComentario: { width: '34%', padding: 6, fontSize: 8, color: COLOR_MUTED },
  commentText: { fontStyle: 'italic' },
  headerCell: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.3 },

  legend: { flexDirection: 'row', gap: 14, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 8, color: COLOR_MUTED },

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

// null = sin dato capturado todavía (se muestra en negro, sin comparar)
function colorFor(pedida, surtida) {
  if (surtida === null || surtida === undefined || surtida === '') return COLOR_INK
  if (Number(surtida) === Number(pedida)) return COLOR_INK
  return Number(surtida) < Number(pedida) ? COLOR_RED : COLOR_GREEN
}

export default function RemisionPdf({ order, orderTypeLabel }) {
  const items = order.items || []
  const rows = items.flatMap((item, itemIndex) =>
    (item.sizes || []).map((sz, sizeIndex) => ({
      key: `${itemIndex}-${sizeIndex}`,
      garment: item.garment || `Prenda ${itemIndex + 1}`,
      talla: sz.talla,
      pedida: Number(sz.cantidad) || 0,
      surtida: sz.cantidad_surtida,
      comentario: sz.comentario_surtido,
    }))
  )
  const hayDiferencias = rows.some(
    (r) => r.surtida !== null && r.surtida !== undefined && r.surtida !== '' && Number(r.surtida) !== r.pedida
  )

  return (
    <Document title={`Remisión ${order.order_number} · SALPER`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Image src={logo} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>REMISIÓN DE ENTREGA</Text>
            <View style={styles.folioBox}>
              <Text style={styles.folioValue}>{order.order_number}</Text>
            </View>
            <Text style={{ fontSize: 8, color: COLOR_MUTED, marginTop: 4 }}>
              Completada el {formatDate(order.updated_at)}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos generales</Text>
          <View style={styles.infoGrid}>
            <InfoField label="Cliente" value={order.client_name} />
            <InfoField label="Tipo de orden" value={orderTypeLabel || order.order_type_key} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pedido vs. surtido</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.cellPrenda, styles.headerCell]}>Prenda</Text>
              <Text style={[styles.cellTalla, styles.headerCell]}>Talla</Text>
              <Text style={[styles.cellPedida, styles.headerCell]}>Pedida</Text>
              <Text style={[styles.cellSurtida, styles.headerCell]}>Surtida</Text>
              <Text style={[styles.cellComentario, styles.headerCell]}>Comentario</Text>
            </View>
            {rows.map((r, i) => (
              <View key={r.key} style={[styles.tableRow, i === rows.length - 1 && styles.tableRow_last]}>
                <Text style={styles.cellPrenda}>{r.garment}</Text>
                <Text style={styles.cellTalla}>{r.talla}</Text>
                <Text style={styles.cellPedida}>{r.pedida}</Text>
                <Text style={[styles.cellSurtida, { color: colorFor(r.pedida, r.surtida) }]}>
                  {r.surtida === null || r.surtida === undefined || r.surtida === '' ? '—' : r.surtida}
                </Text>
                <Text style={[styles.cellComentario, styles.commentText]}>{r.comentario || ''}</Text>
              </View>
            ))}
          </View>

          {hayDiferencias && (
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLOR_INK }]} />
                <Text style={styles.legendLabel}>Igual a lo pedido</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLOR_RED }]} />
                <Text style={styles.legendLabel}>Faltante</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLOR_GREEN }]} />
                <Text style={styles.legendLabel}>Sobrante</Text>
              </View>
            </View>
          )}
        </View>

        <Text style={styles.footnote}>Remisión generada al completar la orden en SALPER</Text>
      </Page>
    </Document>
  )
}
