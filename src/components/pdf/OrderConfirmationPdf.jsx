import { Document, Page, View, Text, Image, Svg, Path, StyleSheet } from '@react-pdf/renderer'
import logo from '../../assets/salper-logo.png'
import { ORDER_SHEET_SIZES, emptyOrderSheetSection } from '../../lib/constants'

// PDF de confirmación de orden — réplica de la hoja física de taller de
// SALPER. Se genera con @react-pdf/renderer, tamaño carta vertical.
//
// ⚠️ Domicilio / teléfonos / correo de la empresa: el usuario pidió
// dejarlos en blanco por ahora (se llenarán aquí a mano cuando los tenga).
const COMPANY = {
  name: 'SALPER, S.A. DE C.V.',
  address: '', // TODO: domicilio exacto
  phones: '', // TODO: teléfono(s) exacto(s)
  email: '', // TODO: correo exacto
}

const COLOR_INK = '#1a1a1a'
const COLOR_BORDER = '#1a1a1a'
const COLOR_RED = '#c1272d'
const COLOR_BG = '#fafaf5'
const COLOR_FILL = '#111111'

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLOR_BG,
    color: COLOR_INK,
    fontFamily: 'Times-Roman',
    fontSize: 8,
    padding: 24,
  },
  // ---- Encabezado ----
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1.4,
  },
  logo: { width: 60, height: 60, objectFit: 'contain' },
  companyInfo: { gap: 1.5 },
  companyName: { fontFamily: 'Times-Bold', fontSize: 11 },
  companyLine: { fontSize: 7.5, color: COLOR_INK },
  headerRight: { flex: 1, alignItems: 'flex-end', gap: 6 },
  folioBox: {
    border: `1.4pt solid ${COLOR_RED}`,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignItems: 'center',
    minWidth: 130,
  },
  folioLabel: { fontSize: 7, letterSpacing: 1, color: COLOR_RED },
  folioValue: { fontFamily: 'Times-Bold', fontSize: 20, color: COLOR_RED },
  workOrderBox: {
    border: `1pt solid ${COLOR_BORDER}`,
    paddingVertical: 3,
    paddingHorizontal: 10,
    minWidth: 130,
    alignItems: 'center',
  },
  workOrderText: { fontFamily: 'Times-Bold', fontSize: 8.5, textAlign: 'center' },
  dateLine: { fontFamily: 'Times-Italic', fontSize: 9, minWidth: 130, textAlign: 'right' },

  // ---- Cuerpo: dos columnas ----
  body: { flexDirection: 'row', gap: 10 },
  bodyLeft: { flex: 1.5, gap: 8 },
  bodyRight: { flex: 1, alignItems: 'center', gap: 14, paddingTop: 6 },

  section: { border: `1pt solid ${COLOR_BORDER}`, padding: 6 },
  sectionTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 9,
    textAlign: 'center',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  field: { width: '33.33%', flexDirection: 'row', marginBottom: 3, paddingRight: 4 },
  fieldLabel: { fontFamily: 'Times-Bold', fontSize: 6.5 },
  fieldValue: {
    fontSize: 7.5,
    flex: 1,
    borderBottomWidth: 0.6,
    borderBottomColor: COLOR_BORDER,
    marginLeft: 3,
    minHeight: 9,
  },
  sizesRow: { flexDirection: 'row', marginTop: 2 },
  sizeCell: {
    flex: 1,
    border: `0.6pt solid ${COLOR_BORDER}`,
    alignItems: 'center',
    paddingVertical: 2,
  },
  sizeCellMarked: { backgroundColor: COLOR_FILL },
  sizeNumber: { fontSize: 6.5, fontFamily: 'Times-Bold' },
  sizeNumberMarked: { color: COLOR_BG },
  sizeQty: { fontSize: 6, marginTop: 1 },
  sizeQtyMarked: { color: COLOR_BG },

  illustrationLabel: { fontSize: 7, fontFamily: 'Times-Italic' },

  // ---- Pie ----
  footer: { marginTop: 10, borderTop: `1pt solid ${COLOR_BORDER}`, paddingTop: 8, gap: 6 },
  footerRow: { flexDirection: 'row', gap: 16 },
  footerField: { flexDirection: 'row', flex: 1, alignItems: 'flex-end' },
  footerLabel: { fontFamily: 'Times-Bold', fontSize: 7.5 },
  footerValue: {
    fontSize: 8,
    flex: 1,
    borderBottomWidth: 0.6,
    borderBottomColor: COLOR_BORDER,
    marginLeft: 4,
    minHeight: 10,
  },
  signatureBlock: { marginTop: 14, alignItems: 'center' },
  signatureLine: { borderTopWidth: 0.8, borderTopColor: COLOR_BORDER, width: 220, marginBottom: 3 },
  signatureCaption: { fontSize: 7, fontFamily: 'Times-Bold' },
  footnote: { marginTop: 10, fontSize: 7, fontFamily: 'Times-Italic', textAlign: 'center', color: COLOR_RED },
})

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}:</Text>
      <Text style={styles.fieldValue}>{value || ''}</Text>
    </View>
  )
}

function FooterField({ label, value }) {
  return (
    <View style={styles.footerField}>
      <Text style={styles.footerLabel}>{label}:</Text>
      <Text style={styles.footerValue}>{value || ''}</Text>
    </View>
  )
}

function SizesRow({ sizes }) {
  return (
    <View style={styles.sizesRow}>
      {ORDER_SHEET_SIZES.map((size) => {
        const qty = sizes?.[size]
        const marked = qty !== undefined && qty !== null && String(qty).trim() !== ''
        return (
          <View key={size} style={[styles.sizeCell, marked && styles.sizeCellMarked]}>
            <Text style={[styles.sizeNumber, marked && styles.sizeNumberMarked]}>{size}</Text>
            <Text style={[styles.sizeQty, marked && styles.sizeQtyMarked]}>{marked ? qty : ''}</Text>
          </View>
        )
      })}
    </View>
  )
}

function GarmentSection({ title, section }) {
  const s = section || emptyOrderSheetSection()
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.fieldGrid}>
        <Field label="Cliente" value={s.cliente} />
        <Field label="Color" value={s.color} />
        <Field label="Manga" value={s.manga} />
        <Field label="Vivos" value={s.vivos} />
        <Field label="Cuello" value={s.cuello} />
        <Field label="Puños" value={s.punos} />
        <Field label="Tela" value={s.tela} />
        <Field label="Logotipos" value={s.logotipos} />
        <Field label="Números" value={s.numeros} />
      </View>
      <SizesRow sizes={s.sizes} />
    </View>
  )
}

// Ilustraciones de línea simples (no son un facsímil exacto de la hoja
// física — son un dibujo esquemático de referencia para marcar detalles).
function ShirtIllustration() {
  return (
    <Svg width="90" height="100" viewBox="0 0 100 110">
      <Path
        d="M32,8 L44,8 L50,16 L56,8 L68,8 L88,26 L76,40 L68,32 L68,102 L32,102 L32,32 L24,40 L12,26 Z"
        stroke={COLOR_INK}
        strokeWidth={1.4}
        fill="none"
      />
    </Svg>
  )
}

function ShortsIllustration() {
  return (
    <Svg width="90" height="90" viewBox="0 0 100 100">
      <Path
        d="M16,6 L84,6 L84,52 L62,52 L59,94 L47,94 L50,52 L50,52 L41,52 L44,94 L32,94 L29,52 L16,52 Z"
        stroke={COLOR_INK}
        strokeWidth={1.4}
        fill="none"
      />
    </Svg>
  )
}

export default function OrderConfirmationPdf({ order }) {
  const sheet = order.order_sheet || {}
  const pending = order.status === 'en_confirmacion'

  return (
    <Document title={`Orden ${order.order_number} · SALPER`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image src={logo} style={styles.logo} />
            <View style={styles.companyInfo}>
              <Text style={styles.companyName}>{COMPANY.name}</Text>
              {!!COMPANY.address && <Text style={styles.companyLine}>{COMPANY.address}</Text>}
              {!!COMPANY.phones && <Text style={styles.companyLine}>{COMPANY.phones}</Text>}
              {!!COMPANY.email && <Text style={styles.companyLine}>{COMPANY.email}</Text>}
            </View>
          </View>

          <View style={styles.headerRight}>
            <View style={styles.folioBox}>
              <Text style={styles.folioLabel}>FOLIO</Text>
              <Text style={styles.folioValue}>{order.order_number}</Text>
            </View>
            <View style={styles.workOrderBox}>
              <Text style={styles.workOrderText}>ORDEN DE TALLER</Text>
              <Text style={styles.workOrderText}>TORREÓN, COAH.</Text>
            </View>
            <Text style={styles.dateLine}>{formatDate(order.created_at)}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.bodyLeft}>
            <GarmentSection title="PLAYERA O CHAMARRA" section={sheet.sections?.playera} />
            <GarmentSection title="SHORT / PANTALÓN" section={sheet.sections?.short} />
          </View>

          <View style={styles.bodyRight}>
            <ShirtIllustration />
            <ShortsIllustration />
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <FooterField label="Vendedor" value={sheet.vendedor} />
            <FooterField label="Fecha de entrega prometida" value={formatDate(order.requested_delivery_date)} />
          </View>

          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureCaption}>FIRMA DEL CLIENTE</Text>
          </View>

          <View style={styles.footerRow}>
            <FooterField label="Nombre" value={sheet.contact_name || order.client_name} />
            <FooterField label="Domicilio" value={sheet.contact_address} />
            <FooterField label="Teléfono" value={sheet.contact_phone} />
          </View>

          <View style={styles.footerRow}>
            <FooterField label="Torneos en los que interviene" value={sheet.torneos} />
          </View>

          {pending && <Text style={styles.footnote}>Orden sujeta a confirmación de fábrica</Text>}
        </View>
      </Page>
    </Document>
  )
}
