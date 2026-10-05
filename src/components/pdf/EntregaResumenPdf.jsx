import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import logo from '../../assets/salper-logo.png'

// Resumen de entrega (V77): todo en un solo lugar — cliente, qué se entrega,
// precios, totales, anticipos, saldo y datos fiscales. Los números vienen de
// orden_resumen_entrega (Supabase); este componente solo los acomoda.
const INK = '#1a1a1a'
const MUTED = '#6b6558'
const BORDER = '#dcd6c8'
const AMBER = '#ffc93c'
const ORANGE = '#e8720c'

const styles = StyleSheet.create({
  page: { backgroundColor: '#ffffff', color: INK, fontFamily: 'Helvetica', fontSize: 9.5, padding: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  logo: { width: 64, height: 64, objectFit: 'contain' },
  headerRight: { alignItems: 'flex-end' },
  docTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: MUTED, letterSpacing: 1 },
  folioBox: { backgroundColor: AMBER, paddingVertical: 5, paddingHorizontal: 14, marginTop: 6 },
  folioValue: { fontFamily: 'Helvetica-Bold', fontSize: 20 },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold', fontSize: 9, color: ORANGE, textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 6, borderBottom: `1pt solid ${BORDER}`, paddingBottom: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  field: { width: '50%', marginBottom: 6, paddingRight: 10 },
  label: { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 10 },
  thead: { flexDirection: 'row', borderBottom: `1pt solid ${INK}`, paddingBottom: 3, marginBottom: 3 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: MUTED, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', paddingVertical: 5, borderBottom: `0.5pt solid ${BORDER}` },
  cPrenda: { width: '38%', paddingRight: 6 },
  cPiezas: { width: '9%', textAlign: 'right' },
  cPrecio: { width: '16%', textAlign: 'right' },
  cExtras: { width: '19%', textAlign: 'right' },
  cSub: { width: '18%', textAlign: 'right' },
  spec: { fontSize: 8, color: MUTED, marginTop: 1 },
  totals: { alignSelf: 'flex-end', width: '46%', marginTop: 8 },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totBold: { fontFamily: 'Helvetica-Bold', fontSize: 11, borderTop: `1pt solid ${INK}`, marginTop: 3, paddingTop: 4 },
  saldoBox: { backgroundColor: AMBER, paddingVertical: 4, paddingHorizontal: 6, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' },
  small: { fontSize: 8.5, color: MUTED },
})

function mxn(n) {
  return Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function fecha(d) {
  if (!d) return '—'
  const dt = new Date(String(d).length <= 10 ? `${d}T12:00:00` : d)
  return dt.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function specsDe(item) {
  return [
    item.color && `Color: ${item.color}`,
    item.pantone && `Pantone: ${item.pantone}`,
    item.tela_nombre && `Tela: ${item.tela_nombre}`,
    item.manga && `Manga: ${item.manga}`,
    item.cuello && `Cuello: ${item.cuello}`,
    item.punos && `Puños: ${item.punos}`,
    item.vivos && `Vivos: ${item.vivos}`,
    item.logotipos && `Logotipos: ${item.logotipos}`,
    item.numeros && `Números: ${item.numeros}`,
    item.bordados?.length > 0 && `Bordados: ${item.bordados.map((b) => b.ubicacion || 'foto').join(', ')}`,
    item.lleva_bordado && (item.bordado_ubicacion ? `Lleva bordado (${item.bordado_ubicacion})` : 'Lleva bordado'),
    item.lleva_impresion && 'Lleva impresión',
    item.lleva_bolsas && 'Lleva bolsas',
  ].filter(Boolean)
}

function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  )
}

export default function EntregaResumenPdf({ data }) {
  const { orden, cliente, facturacion, totales, anticipos } = data
  const items = orden.items || []
  const porIndice = Object.fromEntries((totales.renglones || []).map((r) => [r.item_index, r]))
  const fiscal = facturacion.fiscal

  return (
    <Document title={`Resumen de entrega ${orden.order_number}`}>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header}>
          <Image src={logo} style={styles.logo} />
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>RESUMEN DE ENTREGA</Text>
            <View style={styles.folioBox}>
              <Text style={styles.folioValue}>{orden.order_number}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <View style={styles.grid}>
            <Field label="Cliente" value={cliente?.nombre || orden.client_name} />
            <Field label="Fecha de entrega acordada" value={fecha(orden.requested_delivery_date)} />
            <Field label="Teléfono" value={cliente?.telefono} />
            <Field label="Correo" value={cliente?.correo} />
          </View>
          {!!orden.description && (
            <View>
              <Text style={styles.label}>Descripción / especificaciones</Text>
              <Text style={styles.value}>{orden.description}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Qué se entrega</Text>
          <View style={styles.thead}>
            <Text style={[styles.th, styles.cPrenda]}>Prenda</Text>
            <Text style={[styles.th, styles.cPiezas]}>Pzas</Text>
            <Text style={[styles.th, styles.cPrecio]}>Precio unit.</Text>
            <Text style={[styles.th, styles.cExtras]}>Extras / pza</Text>
            <Text style={[styles.th, styles.cSub]}>Subtotal</Text>
          </View>
          {items.map((item, i) => {
            const piezas = (item.sizes || []).reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0)
            if (piezas <= 0) return null
            const r = porIndice[i]
            const tallas = (item.sizes || []).filter((sz) => Number(sz.cantidad) > 0).map((sz) => `${sz.talla} × ${sz.cantidad}`).join('   ')
            return (
              <View key={i} style={styles.tr} wrap={false}>
                <View style={styles.cPrenda}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{item.garment || `Prenda ${i + 1}`}</Text>
                  <Text style={styles.spec}>{tallas}</Text>
                  {specsDe(item).length > 0 && <Text style={styles.spec}>{specsDe(item).join(' · ')}</Text>}
                </View>
                <Text style={styles.cPiezas}>{piezas}</Text>
                <Text style={styles.cPrecio}>{r ? mxn(r.precio_unitario) : 'Sin precio'}</Text>
                <View style={styles.cExtras}>
                  {r && (r.extras || []).length > 0 ? (
                    (r.extras || []).map((e, j) => (
                      <Text key={j} style={styles.spec}>
                        {e.concepto} +{mxn(e.monto)}
                      </Text>
                    ))
                  ) : (
                    <Text>—</Text>
                  )}
                </View>
                <Text style={styles.cSub}>{r ? mxn(r.subtotal_renglon) : '—'}</Text>
              </View>
            )
          })}

          <View style={styles.totals} wrap={false}>
            <View style={styles.totRow}>
              <Text>Subtotal</Text>
              <Text>{mxn(totales.subtotal)}</Text>
            </View>
            {totales.requiere_factura && (
              <View style={styles.totRow}>
                <Text>IVA 16%</Text>
                <Text>{mxn(totales.iva)}</Text>
              </View>
            )}
            <View style={[styles.totRow, styles.totBold]}>
              <Text>Total</Text>
              <Text>{mxn(totales.total)}</Text>
            </View>
            <View style={styles.totRow}>
              <Text>Anticipos / abonos</Text>
              <Text>− {mxn(totales.anticipos)}</Text>
            </View>
            <View style={styles.saldoBox}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>Saldo pendiente</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{mxn(totales.saldo)}</Text>
            </View>
          </View>
        </View>

        {(anticipos || []).length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Anticipos y abonos registrados</Text>
            {anticipos.map((a, i) => (
              <View key={i} style={styles.totRow}>
                <Text>
                  {fecha(a.fecha)} · {a.metodo_pago} · recibió {a.recibido_por}
                </Text>
                <Text>{mxn(a.monto)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Facturación</Text>
          {facturacion.requiere_factura && fiscal ? (
            <View>
              <View style={styles.grid}>
                <Field label="Razón social" value={fiscal.razon_social} />
                <Field label="RFC" value={fiscal.rfc} />
                <Field label="Régimen fiscal" value={fiscal.regimen_fiscal} />
                <Field label="Código postal fiscal" value={fiscal.cp_fiscal} />
                <Field label="Uso de CFDI" value={fiscal.uso_cfdi} />
                <Field label="Correo para factura" value={fiscal.correo_factura} />
              </View>
              <Text style={styles.small}>
                Precios {facturacion.precios_incluyen_iva ? 'con IVA incluido' : 'más IVA'}.
              </Text>
            </View>
          ) : facturacion.requiere_factura ? (
            <Text style={{ color: '#c7351f' }}>Requiere factura pero falta elegir la razón social.</Text>
          ) : (
            <Text style={styles.small}>Esta orden no requiere factura.</Text>
          )}
        </View>
      </Page>
    </Document>
  )
}
