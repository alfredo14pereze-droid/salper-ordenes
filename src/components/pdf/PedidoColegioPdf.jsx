import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatImporte, montoConLetra, calcSaldo, sumAbonos } from '../../utils/pedidosColegio'

// V57 — Recibo de un Pedido Colegio (beta), basado en el PDF de ejemplo
// SALPER DEPORTES.pdf: encabezado "SALPER DEPORTES" + teléfonos, "Pedido"
// con Fecha/Folio arriba a la derecha, caja de Cliente, tabla de
// artículos y caja de totales con importe con letra + términos fijos.
//
// PÁGINA DOBLE: la misma hoja lleva el recibo dos veces (arriba y abajo,
// separadas por una línea punteada de corte) para imprimir una sola hoja
// y cortarla a la mitad — una copia para SALPER, otra para el cliente.
// Cada mitad tiene espacio para ~12 renglones; si el pedido trae más, cada
// copia pasa a su propia hoja completa (mismo contenido, sin cortar nada).
const MAX_RENGLONES_DOBLE = 12

const INK = '#1a1a1a'
const MUTED = '#6b6558'
const LINE = '#8a8578'

const styles = StyleSheet.create({
  page: { backgroundColor: '#ffffff', color: INK, fontFamily: 'Helvetica', fontSize: 8.5, paddingVertical: 18, paddingHorizontal: 24 },
  pageSingle: { paddingVertical: 28 },
  half: { flex: 1 },
  cutLine: { borderTopWidth: 1, borderTopStyle: 'dashed', borderTopColor: LINE, marginVertical: 8 },

  receipt: { flexGrow: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  brandBlock: { flex: 1, paddingTop: 2 },
  brand: { fontFamily: 'Helvetica-Bold', fontSize: 15, letterSpacing: 0.6 },
  phones: { fontSize: 8, color: MUTED, marginTop: 2 },
  headerRight: { width: 190, alignItems: 'flex-end' },
  docTitle: { fontFamily: 'Helvetica-Bold', fontSize: 15 },
  fechaFolio: { flexDirection: 'row', marginTop: 2 },
  ffCell: { width: 92, borderWidth: 1, borderColor: INK },
  ffLabel: { backgroundColor: INK, color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 8, textAlign: 'center', paddingVertical: 2 },
  ffValue: { fontFamily: 'Helvetica-Bold', fontSize: 10, textAlign: 'center', paddingVertical: 3 },
  copia: { fontSize: 7, color: MUTED, letterSpacing: 0.8, marginTop: 3, textTransform: 'uppercase' },

  clienteBox: { borderWidth: 1, borderColor: INK, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 6 },
  clienteTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginBottom: 2 },
  clienteColegio: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  clienteLine: { fontSize: 8.5, marginTop: 1 },

  table: { borderWidth: 1, borderColor: INK, borderRadius: 4, marginBottom: 5 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: INK, paddingVertical: 3, paddingHorizontal: 6 },
  thText: { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  tr: { flexDirection: 'row', paddingVertical: 1.6, paddingHorizontal: 6 },
  colArticulo: { flex: 1 },
  colTalla: { width: 44, textAlign: 'center' },
  colCant: { width: 42, textAlign: 'right' },
  colPrecio: { width: 60, textAlign: 'right' },
  colImporte: { width: 68, textAlign: 'right' },

  abonosLine: { fontSize: 7.5, color: MUTED, marginBottom: 4 },

  totalsBox: { flexDirection: 'row', borderWidth: 1, borderColor: INK, borderRadius: 4, marginTop: 'auto' },
  totalsLeft: { flex: 1, padding: 6, borderRightWidth: 1, borderRightColor: INK },
  enLetra: { fontSize: 8.5, marginBottom: 5 },
  term: { fontSize: 7.2, lineHeight: 1.3 },
  totalsRight: { width: 200, padding: 6, justifyContent: 'space-between' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  totalLabel: { fontSize: 8.5 },
  totalValue: { fontSize: 8.5, textAlign: 'right' },
  saldoRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: INK, paddingTop: 3, marginTop: 2 },
  saldoText: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
})

const TERMINOS = [
  '* Favor de revisar que las tallas y cantidades estén correctas.',
  '* No se aceptan cambios ni devoluciones.',
  '* Solo se harán entregas totales, no parciales.',
  '* Si no recoge la mercancía después de 2 meses, NO se regresará el anticipo.',
]

function clip(text, max) {
  const value = String(text || '')
  return value.length > max ? value.slice(0, max - 1) + '…' : value
}

function fechaCorta(value) {
  const d = value ? new Date(value) : null
  if (!d || Number.isNaN(d.getTime())) return '—'
  return format(d, 'd/MMM./yyyy', { locale: es })
}

function Recibo({ pedido, copia, compact }) {
  const colegio = pedido.colegio || {}
  const articulos = pedido.articulos || []
  const abonos = pedido.abonos || []
  const abonado = sumAbonos(abonos)
  const saldo = calcSaldo(pedido, abonos)
  const maxNombre = compact ? 46 : 70

  return (
    <View style={styles.receipt}>
      <View style={styles.header}>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>SALPER DEPORTES</Text>
          <Text style={styles.phones}>Tel: 8717120931 y 8717127990</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.docTitle}>Pedido</Text>
          <View style={styles.fechaFolio}>
            <View style={styles.ffCell}>
              <Text style={styles.ffLabel}>Fecha</Text>
              <Text style={styles.ffValue}>{fechaCorta(pedido.fecha_pedido)}</Text>
            </View>
            <View style={styles.ffCell}>
              <Text style={styles.ffLabel}>Folio</Text>
              <Text style={styles.ffValue}>{pedido.folio}</Text>
            </View>
          </View>
          <Text style={styles.copia}>{copia}</Text>
        </View>
      </View>

      <View style={styles.clienteBox}>
        <Text style={styles.clienteTitle}>Cliente</Text>
        <Text style={styles.clienteColegio}>{String(colegio.nombre || '').toUpperCase()}</Text>
        <Text style={styles.clienteLine}>
          {pedido.cliente_nombre}
          {pedido.cliente_referencia ? ` · ${pedido.cliente_referencia}` : ''}
        </Text>
        {!!pedido.cliente_telefono && <Text style={styles.clienteLine}>{pedido.cliente_telefono}</Text>}
      </View>

      <View style={styles.table}>
        <View style={styles.th}>
          <Text style={[styles.thText, styles.colArticulo]}>Artículo</Text>
          <Text style={[styles.thText, styles.colTalla]}>Talla</Text>
          <Text style={[styles.thText, styles.colCant]}>Cant.</Text>
          <Text style={[styles.thText, styles.colPrecio]}>Precio</Text>
          <Text style={[styles.thText, styles.colImporte]}>Importe</Text>
        </View>
        {articulos.map((a) => (
          <View key={a.id} style={styles.tr} wrap={false}>
            <Text style={styles.colArticulo}>{clip(a.articulo, maxNombre)}</Text>
            <Text style={styles.colTalla}>{a.talla || '—'}</Text>
            <Text style={styles.colCant}>{a.cantidad}</Text>
            <Text style={styles.colPrecio}>{formatImporte(a.precio_unitario)}</Text>
            <Text style={styles.colImporte}>{formatImporte(a.importe)}</Text>
          </View>
        ))}
      </View>

      {abonos.length > 0 && (
        <Text style={styles.abonosLine}>
          Abonos: {abonos.map((ab) => `${fechaCorta(ab.fecha)} $${formatImporte(ab.monto)}`).join('  ·  ')}
        </Text>
      )}

      <View style={styles.totalsBox} wrap={false}>
        <View style={styles.totalsLeft}>
          <Text style={styles.enLetra}>{montoConLetra(saldo)}</Text>
          {TERMINOS.map((t) => (
            <Text key={t} style={styles.term}>
              {t}
            </Text>
          ))}
        </View>
        <View style={styles.totalsRight}>
          <View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatImporte(pedido.subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Anticipo {formatImporte(pedido.anticipo_porcentaje)} %</Text>
              <Text style={styles.totalValue}>{formatImporte(pedido.anticipo_monto)}</Text>
            </View>
            {abonado > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Abonos</Text>
                <Text style={styles.totalValue}>{formatImporte(abonado)}</Text>
              </View>
            )}
          </View>
          <View style={styles.saldoRow}>
            <Text style={styles.saldoText}>Saldo pendiente</Text>
            <Text style={styles.saldoText}>{formatImporte(saldo)}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

// `pedido`: lo que regresa fetchPedidoById (pedido + colegio + articulos
// + abonos).
export default function PedidoColegioPdf({ pedido }) {
  const compact = (pedido.articulos || []).length <= MAX_RENGLONES_DOBLE

  if (compact) {
    return (
      <Document title={`Pedido ${pedido.folio}`}>
        <Page size="LETTER" style={styles.page}>
          <View style={styles.half}>
            <Recibo pedido={pedido} copia="Copia SALPER" compact />
          </View>
          <View style={styles.cutLine} />
          <View style={styles.half}>
            <Recibo pedido={pedido} copia="Copia cliente" compact />
          </View>
        </Page>
      </Document>
    )
  }

  return (
    <Document title={`Pedido ${pedido.folio}`}>
      <Page size="LETTER" style={[styles.page, styles.pageSingle]}>
        <Recibo pedido={pedido} copia="Copia SALPER" compact={false} />
      </Page>
      <Page size="LETTER" style={[styles.page, styles.pageSingle]}>
        <Recibo pedido={pedido} copia="Copia cliente" compact={false} />
      </Page>
    </Document>
  )
}
