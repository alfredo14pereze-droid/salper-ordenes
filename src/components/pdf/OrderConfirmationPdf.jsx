import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import logo from '../../assets/salper-logo.png'
import { getStatus } from '../../utils/status'
import { formatDateTime, parseDate } from '../../utils/dates'
import { rosterParaPdf } from '../../utils/pagosPdf'

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
//
// En las dos variantes: la lista de nombres, tallas y números de cada prenda
// que la lleve (sublimación), y "Total y anticipo" cuando llega `pagos` (solo
// se manda si quien genera el PDF puede ver dinero; ver resumenPagosPdf).

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
    padding: 28,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  logo: { width: 62, height: 62, objectFit: 'contain' },
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
  statusBox: { paddingVertical: 4, paddingHorizontal: 12, marginTop: 6 },
  statusLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9 },

  section: { marginBottom: 11 },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: COLOR_ORANGE,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    borderBottom: `1pt solid ${COLOR_BORDER}`,
    paddingBottom: 3,
  },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  infoField: { width: '50%', marginBottom: 6, paddingRight: 10 },
  infoLabel: { fontSize: 7.5, color: COLOR_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 10, marginTop: 2 },

  descriptionBox: { fontSize: 9.5, lineHeight: 1.4 },

  itemCard: {
    border: `1pt solid ${COLOR_BORDER}`,
    borderRadius: 3,
    padding: 8,
    marginBottom: 6,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  itemName: { fontFamily: 'Helvetica-Bold', fontSize: 10.5 },
  itemMeta: { fontSize: 8.5, color: COLOR_MUTED, flex: 1, textAlign: 'right', marginLeft: 12 },
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
  sizesLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTotal: { fontSize: 8.5, textAlign: 'right', color: COLOR_MUTED },
  itemTotal_b: { fontFamily: 'Helvetica-Bold', color: COLOR_INK },

  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fdf2e0',
    borderLeft: `3pt solid ${COLOR_ORANGE}`,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 2,
  },
  grandTotalLabel: { fontSize: 9.5 },
  grandTotalValue: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: COLOR_ORANGE },

  // Lista de nombres y números: en 2 columnas (3 si es muy larga) para que
  // un equipo completo quepa en la misma hoja que el resto de la orden.
  rosterTitle: { fontSize: 7.5, color: COLOR_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 7, marginBottom: 2 },
  rosterLine: { flexDirection: 'row' },
  rosterCell: { flex: 1, flexDirection: 'row', alignItems: 'center', borderBottom: `0.6pt solid ${COLOR_BORDER}`, paddingVertical: 2 },
  rosterHeader: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: COLOR_MUTED },
  rosterN: { width: 18, fontSize: 7.5, color: COLOR_MUTED },
  rosterNombre: { flex: 1, fontSize: 8.5 },
  rosterTalla: { width: 34, fontSize: 8.5 },
  rosterNumero: { width: 32, fontSize: 8.5, fontFamily: 'Helvetica-Bold', textAlign: 'right' },

  // Dinero e historial van lado a lado al final.
  cierre: { flexDirection: 'row' },
  cierreCol: { flex: 1 },
  cierreGap: { width: 18 },
  pagosRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  pagosLabel: { fontSize: 9 },
  pagosValue: { fontSize: 9 },
  pagosTotal: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  pagosSaldo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fdf2e0',
    borderLeft: `3pt solid ${COLOR_ORANGE}`,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  pagosSaldoValue: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: COLOR_ORANGE },

  footnote: {
    marginTop: 8,
    fontSize: 8,
    fontStyle: 'italic',
    color: COLOR_MUTED,
    textAlign: 'center',
    borderTop: `1pt solid ${COLOR_BORDER}`,
    paddingTop: 10,
  },

  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    borderBottom: `0.8pt solid ${COLOR_BORDER}`,
  },
  historyRow_last: { borderBottom: 'none' },
  historyDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  historyStatus: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, width: 82 },
  historyDate: { fontSize: 8, color: COLOR_MUTED, width: 92 },
  historyNotes: { fontSize: 8, color: COLOR_MUTED, flex: 1, fontStyle: 'italic' },
})

function formatDate(value) {
  if (!value) return '—'
  // parseDate y no new Date(): una fecha sola ("2026-10-30") se leería como
  // medianoche UTC y en México saldría un día antes.
  const d = parseDate(value)
  if (!d || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatMxn(n) {
  return Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

// Reparte la lista en columnas llenando hacia abajo (1, 2, 3… en la primera
// columna y sigue en la siguiente). Cada renglón del PDF lleva una celda
// por columna y no se parte entre hojas.
function Roster({ roster }) {
  const columnas = roster.length > 45 ? 3 : roster.length > 6 ? 2 : 1
  const renglones = Math.ceil(roster.length / columnas)
  const celda = (r, c) => roster[c * renglones + r]
  const cols = Array.from({ length: columnas }, (_, c) => c)
  return (
    <View>
      <Text style={styles.rosterTitle}>Nombres y números ({roster.length})</Text>
      <View style={styles.rosterLine} wrap={false}>
        {cols.map((c) => (
          <View key={c} style={[styles.rosterCell, c > 0 && { marginLeft: 14 }]}>
            <Text style={[styles.rosterN, styles.rosterHeader]}>#</Text>
            <Text style={[styles.rosterNombre, styles.rosterHeader]}>Nombre</Text>
            <Text style={[styles.rosterTalla, styles.rosterHeader]}>Talla</Text>
            <Text style={[styles.rosterNumero, styles.rosterHeader, { color: COLOR_MUTED }]}>Núm.</Text>
          </View>
        ))}
      </View>
      {Array.from({ length: renglones }, (_, r) => (
        <View key={r} style={styles.rosterLine} wrap={false}>
          {cols.map((c) => {
            const fila = celda(r, c)
            const estilo = [styles.rosterCell, c > 0 && { marginLeft: 14 }, !fila && { borderBottom: 'none' }]
            return (
              <View key={c} style={estilo}>
                {fila && (
                  <>
                    <Text style={styles.rosterN}>{c * renglones + r + 1}</Text>
                    <Text style={styles.rosterNombre}>{fila.nombre || '—'}</Text>
                    <Text style={styles.rosterTalla}>{fila.talla || '—'}</Text>
                    <Text style={styles.rosterNumero}>{fila.numero || '—'}</Text>
                  </>
                )}
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

function InfoField({ label, value }) {
  return (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  )
}

export default function OrderConfirmationPdf({ order, orderTypeLabel, variant = 'interno', history = [], pagos = null }) {
  const isInternal = variant === 'interno'
  const items = order.items || []
  const grandTotal = items.reduce(
    (sum, item) => sum + (item.sizes || []).reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0),
    0
  )
  const pending = order.status === 'en_confirmacion'
  const currentStatus = getStatus(order.status)

  // El historial llega más reciente primero (ver fetchOrderHistory) — para
  // el PDF se cuenta la historia en orden cronológico, de más vieja a más
  // nueva, como una bitácora que el cliente pueda seguir de arriba a abajo.
  const historyAsc = [...history].sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))

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
            <View style={[styles.statusBox, { backgroundColor: currentStatus.color }]}>
              <Text style={[styles.statusLabel, { color: currentStatus.textColor }]}>
                Estado actual: {currentStatus.label}
              </Text>
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
            <Text style={styles.sectionTitle} minPresenceAhead={60}>Prendas, tallas y colores</Text>
            {items.map((item, i) => {
              const itemTotal = (item.sizes || []).reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0)
              const roster = rosterParaPdf(item)
              return (
                <View key={i} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName}>{item.garment || `Prenda ${i + 1}`}</Text>
                    <Text style={styles.itemMeta}>
                      {[item.color, item.pantone].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.sizesLine}>
                    <View style={[styles.sizesRow, { flex: 1 }]}>
                      {(item.sizes || []).map((sz, j) => (
                        <View key={j} style={styles.sizeChip}>
                          <Text style={styles.sizeChipTalla}>{sz.talla}</Text>
                          <Text style={styles.sizeChipCantidad}>× {sz.cantidad}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.itemTotal}>
                      Piezas: <Text style={styles.itemTotal_b}>{itemTotal}</Text>
                    </Text>
                  </View>
                  {roster.length > 0 && <Roster roster={roster} />}
                </View>
              )
            })}

            <View style={styles.grandTotal} wrap={false}>
              <Text style={styles.grandTotalLabel}>Total de piezas en la orden</Text>
              <Text style={styles.grandTotalValue}>{grandTotal}</Text>
            </View>
          </View>
        )}

        {(pagos || historyAsc.length > 0) && (
          <View style={styles.cierre} wrap={false}>
            {pagos && (
              <View style={styles.cierreCol}>
                <Text style={styles.sectionTitle}>Total y anticipo</Text>
                {pagos.subtotal != null && (
                  <View style={styles.pagosRow}>
                    <Text style={styles.pagosLabel}>Subtotal</Text>
                    <Text style={styles.pagosValue}>{formatMxn(pagos.subtotal)}</Text>
                  </View>
                )}
                {pagos.iva != null && (
                  <View style={styles.pagosRow}>
                    <Text style={styles.pagosLabel}>IVA 16%</Text>
                    <Text style={styles.pagosValue}>{formatMxn(pagos.iva)}</Text>
                  </View>
                )}
                {pagos.total != null && (
                  <View style={styles.pagosRow}>
                    <Text style={[styles.pagosLabel, styles.pagosTotal]}>Total de la orden</Text>
                    <Text style={styles.pagosTotal}>{formatMxn(pagos.total)}</Text>
                  </View>
                )}
                <View style={styles.pagosRow}>
                  <Text style={styles.pagosLabel}>Anticipo recibido</Text>
                  <Text style={styles.pagosValue}>{formatMxn(pagos.anticipos)}</Text>
                </View>
                {pagos.saldo != null && (
                  <View style={styles.pagosSaldo}>
                    <Text style={styles.pagosLabel}>Restante por pagar</Text>
                    <Text style={styles.pagosSaldoValue}>{formatMxn(pagos.saldo)}</Text>
                  </View>
                )}
              </View>
            )}
            {pagos && historyAsc.length > 0 && <View style={styles.cierreGap} />}
            {historyAsc.length > 0 && (
              <View style={styles.cierreCol}>
                <Text style={styles.sectionTitle}>Historial de estado</Text>
                {historyAsc.map((entry, i) => {
                  const entryStatus = getStatus(entry.status)
                  return (
                    <View key={entry.id || i} style={[styles.historyRow, i === historyAsc.length - 1 && styles.historyRow_last]}>
                      <View style={[styles.historyDot, { backgroundColor: entryStatus.color }]} />
                      <Text style={styles.historyStatus}>{entryStatus.label}</Text>
                      <Text style={styles.historyDate}>{formatDateTime(entry.changed_at)}</Text>
                      {!!entry.notes && <Text style={styles.historyNotes}>{entry.notes}</Text>}
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        )}

        {pending && <Text style={styles.footnote}>Orden sujeta a confirmación de fábrica</Text>}
      </Page>
    </Document>
  )
}
