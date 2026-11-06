import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import logo from '../../assets/salper-logo.png'
import { agruparPorCliente, diasParaEntrega, piezasDeOrden, prendasDeOrden } from '../../utils/reportePendientes'

// Reporte de la fábrica (desde Resumen): órdenes agrupadas por cliente con
// folio, tipo, estado, fechas, prendas/tallas y piezas. Lo usan los dos PDFs:
// "Pendientes de entrega" y "Sin empezar" (ver utils/reportePendientes.js).
const INK = '#1a1a1a'
const MUTED = '#6b6558'
const BORDER = '#dcd6c8'
const AMBER = '#ffc93c'
const RED = '#c0392b'

const s = StyleSheet.create({
  page: { backgroundColor: '#fff', color: INK, fontFamily: 'Helvetica', fontSize: 8.5, paddingVertical: 26, paddingHorizontal: 28 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  logo: { width: 48, height: 48, objectFit: 'contain' },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 16 },
  sub: { fontSize: 9, color: MUTED, marginTop: 2 },
  totales: { flexDirection: 'row', backgroundColor: AMBER, paddingVertical: 5, paddingHorizontal: 10, marginBottom: 10 },
  totalTxt: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginRight: 22 },
  cliente: { flexDirection: 'row', justifyContent: 'space-between', borderBottom: `1.2pt solid ${INK}`, paddingBottom: 2, marginTop: 10, marginBottom: 2 },
  clienteNombre: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  clienteInfo: { fontSize: 8.5, color: MUTED },
  thead: { flexDirection: 'row', borderBottom: `0.8pt solid ${BORDER}`, paddingVertical: 3 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: MUTED, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', paddingVertical: 4, borderBottom: `0.5pt solid ${BORDER}` },
  cFolio: { width: 62, paddingRight: 4, fontFamily: 'Helvetica-Bold' },
  cTipo: { width: 70, paddingRight: 4 },
  cEstado: { width: 88, paddingRight: 4 },
  cCreada: { width: 58, paddingRight: 4 },
  cEntrega: { width: 78, paddingRight: 4 },
  cPrendas: { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 6 },
  cPiezas: { width: 40, textAlign: 'right' },
  prendaNombre: { fontFamily: 'Helvetica-Bold' },
  tallas: { color: MUTED },
  atrasada: { color: RED, fontFamily: 'Helvetica-Bold' },
  pie: { position: 'absolute', bottom: 14, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED },
  vacio: { marginTop: 30, textAlign: 'center', fontSize: 11, color: MUTED },
})

function fecha(d) {
  if (!d) return '—'
  const dt = new Date(String(d).length <= 10 ? `${d}T12:00:00` : d)
  return dt.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })
}

function textoEntrega(order, hoy) {
  const dias = diasParaEntrega(order.requested_delivery_date, hoy)
  if (dias == null) return { txt: '—', atrasada: false }
  if (dias < 0) return { txt: `Atrasada ${-dias} día${dias === -1 ? '' : 's'}`, atrasada: true }
  if (dias === 0) return { txt: 'Hoy', atrasada: true }
  return { txt: `En ${dias} día${dias === 1 ? '' : 's'}`, atrasada: false }
}

// titulo: "Pendientes de entrega" / "Órdenes sin empezar"; nota: texto bajo el título.
// tipos: { key: label }; estados: (status) => label; hoy: 'yyyy-mm-dd'.
export default function PendientesFabricaPdf({ titulo, nota, orders, tipos = {}, estado = (k) => k, hoy, generado }) {
  const grupos = agruparPorCliente(orders)
  const piezas = grupos.reduce((t, g) => t + g.piezas, 0)
  const atrasadas = orders.filter((o) => (diasParaEntrega(o.requested_delivery_date, hoy) ?? 1) < 0).length
  return (
    <Document title={`SALPER - ${titulo}`}>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.title}>{titulo}</Text>
            <Text style={s.sub}>{nota}</Text>
            <Text style={s.sub}>Generado el {generado}</Text>
          </View>
          <Image src={logo} style={s.logo} />
        </View>

        <View style={s.totales}>
          <Text style={s.totalTxt}>{orders.length} {orders.length === 1 ? 'orden' : 'órdenes'}</Text>
          <Text style={s.totalTxt}>{grupos.length} {grupos.length === 1 ? 'cliente' : 'clientes'}</Text>
          <Text style={s.totalTxt}>{piezas.toLocaleString('es-MX')} piezas</Text>
          {atrasadas > 0 && <Text style={[s.totalTxt, { color: RED }]}>{atrasadas} atrasada{atrasadas === 1 ? '' : 's'}</Text>}
        </View>

        {orders.length === 0 && <Text style={s.vacio}>No hay órdenes en este reporte.</Text>}

        {grupos.map((g) => (
          <View key={g.cliente}>
            <View style={s.cliente} minPresenceAhead={40}>
              <Text style={s.clienteNombre}>{g.cliente}</Text>
              <Text style={s.clienteInfo}>
                {g.ordenes.length} {g.ordenes.length === 1 ? 'orden' : 'órdenes'} · {g.piezas.toLocaleString('es-MX')} piezas
              </Text>
            </View>
            <View style={s.thead}>
              <Text style={[s.th, s.cFolio]}>Folio</Text>
              <Text style={[s.th, s.cTipo]}>Tipo</Text>
              <Text style={[s.th, s.cEstado]}>Estado</Text>
              <Text style={[s.th, s.cCreada]}>Creada</Text>
              <Text style={[s.th, s.cEntrega]}>Entrega</Text>
              <Text style={[s.th, s.cPrendas]}>Prendas y tallas</Text>
              <Text style={[s.th, s.cPiezas]}>Piezas</Text>
            </View>
            {g.ordenes.map((o) => {
              const ent = textoEntrega(o, hoy)
              const prendas = prendasDeOrden(o)
              return (
                <View key={o.id} style={s.tr} wrap={false}>
                  <Text style={s.cFolio}>#{o.order_number}</Text>
                  <Text style={s.cTipo}>{tipos[o.order_type_key] || o.order_type_key || '—'}</Text>
                  <Text style={s.cEstado}>{estado(o.status)}</Text>
                  <Text style={s.cCreada}>{fecha(o.created_at)}</Text>
                  <View style={s.cEntrega}>
                    <Text>{fecha(o.requested_delivery_date)}</Text>
                    <Text style={ent.atrasada ? s.atrasada : s.tallas}>{ent.txt}</Text>
                  </View>
                  <View style={s.cPrendas}>
                    {prendas.length === 0 && <Text style={s.tallas}>Sin prendas capturadas</Text>}
                    {prendas.map((p, i) => (
                      <Text key={i}>
                        <Text style={s.prendaNombre}>{p.nombre}</Text>
                        {p.tallas ? <Text style={s.tallas}>{`: ${p.tallas}`}</Text> : null}
                      </Text>
                    ))}
                  </View>
                  <Text style={s.cPiezas}>{piezasDeOrden(o).toLocaleString('es-MX')}</Text>
                </View>
              )
            })}
          </View>
        ))}

        <View style={s.pie} fixed>
          <Text>SALPER · {titulo}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
