import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import logo from '../../assets/salper-logo.png'

// PDF de confirmación de orden — versión simple: logo, folio (asignado
// automáticamente por la base de datos) y la información que ya se llenó
// en el formulario de "Nueva orden" (cliente, tipo, fechas, descripción,
// prendas/tallas/colores). Se genera con @react-pdf/renderer, tamaño
// carta vertical, siguiendo la identidad visual de la app (fondo blanco,
// texto negro, acentos en ámbar/naranja).
//
// Hay dos variantes del mismo documento (mismo componente, mismos datos):
// - "interno": todo, incluyendo el tiempo estimado de producción — para
//   uso de SALPER.
// - "cliente": lo mismo pero sin el tiempo estimado de producción — para
//   mandarle al cliente.

const COLOR_INK = '#1a1a1a'
const COLOR_MUTED = '#6b6558'
const COLOR_BORDER = '#dcd6c8'
const COLOR_AMBER = '#ffc93c'
const COLOR_ORANGE = '#e8720c'

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    color: COLOR_INK,
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    padding: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  logo: { width: 70, height: 70, objectFit: 'contain' },
  headerRight: { alignItems: 'flex-end' },
  docTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: COLOR_MUTED, letterSpacing: 1 },
  folioBox: {
    backgroundColor: COLOR_AMBER,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginTop: 6,
  },
  folioValue: { fontFamily: 'Helvetica-Bold', fontSize: 20, color: COLOR_INK },
  createdAt: { fontSize: 8, color: COLOR_MUTED, marginTop: 4 },

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

  descriptionBox: { fontSize: 9.5, lineHeight: 1.4 },

  itemCard: {
    border: `1pt solid ${COLOR_BORDER}`,
    borderRadius: 3,
    padding: 10,
    marginBottom: 8,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  itemName: { fontFamily: 'Helvetica-Bold', fontSize: 10.5 },
  itemMeta: { fontSize: 8.5, color: COLOR_MUTED },
  sizesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sizeChip: {
    flexDirection: 'row',
    border: `0.8pt solid ${COLOR_BORDER}`,
    borderRadius: 2,
    paddingVertical: 3,
    paddingHorizontal: 6,
    gap: 4,
  },
  sizeChipTalla: { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  sizeChipCantidad: { fontSize: 8.5, color: COLOR_MUTED },
  itemTotal: { fontSize: 8.5, marginTop: 6, textAlign: 'right', color: COLOR_MUTED },
  itemTotal_b: { fontFamily: 'Helvetica-Bold', color: COLOR_INK },

  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fdf2e0',
    borderLeft: `3pt solid ${COLOR_ORANGE}`,
    padding: 10,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: 9.5 },
  grandTotalValue: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: COLOR_ORANGE },

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

export default function OrderConfirmationPdf({ order, orderTypeLabel, variant = 'interno' }) {
  const isInternal = variant === 'interno'
  const items = order.items || []
  const grandTotal = items.reduce(
    (sum, item) => sum + (item.sizes || []).reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0),
    0
  )
  const pending = order.status === 'en_confirmacion'

  return (
    <Document title={`Orden ${order.order_number} · SALPER`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Image src={logo} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>{isInternal ? 'ORDEN DE PRODUCCIÓN' : 'CONFIRMACIÓN DE PEDIDO'}</Text>
            <View style={styles.folioBox}>
              <Text style={styles.folioValue}>{order.order_number}</Text>
            </View>
            <Text style={styles.createdAt}>Creada el {formatDate(order.created_at)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos generales</Text>
          <View style={styles.infoGrid}>
            <InfoField label="Cliente" value={order.client_name} />
            <InfoField label="Tipo de orden" value={orderTypeLabel || order.order_type_key} />
            <InfoField label="Fecha de entrega solicitada" value={formatDate(order.requested_delivery_date)} />
            {isInternal && (
              <InfoField
                label="Tiempo estimado de producción"
                value={order.estimated_production_days ? `${order.estimated_production_days} día(s)` : 'Pendiente'}
              />
            )}
          </View>
          {!!order.description && (
            <View style={{ marginTop: 4 }}>
              <Text style={styles.infoLabel}>Descripción / especificaciones</Text>
              <Text style={[styles.descriptionBox, { marginTop: 3 }]}>{order.description}</Text>
            </View>
          )}
        </View>

        {items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prendas, tallas y colores</Text>
            {items.map((item, i) => {
              const itemTotal = (item.sizes || []).reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0)
              return (
                <View key={i} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName}>{item.garment || `Prenda ${i + 1}`}</Text>
                    <Text style={styles.itemMeta}>
                      {[item.color, item.pantone].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.sizesRow}>
                    {(item.sizes || []).map((sz, j) => (
                      <View key={j} style={styles.sizeChip}>
                        <Text style={styles.sizeChipTalla}>{sz.talla}</Text>
                        <Text style={styles.sizeChipCantidad}>× {sz.cantidad}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.itemTotal}>
                    Piezas en esta prenda: <Text style={styles.itemTotal_b}>{itemTotal}</Text>
                  </Text>
                </View>
              )
            })}

            <View style={styles.grandTotal}>
              <Text style={styles.grandTotalLabel}>Total de piezas en la orden</Text>
              <Text style={styles.grandTotalValue}>{grandTotal}</Text>
            </View>
          </View>
        )}

        {pending && <Text style={styles.footnote}>Orden sujeta a confirmación de fábrica</Text>}
      </Page>
    </Document>
  )
}
