import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import logo from '../../assets/salper-logo.png'

// 2026-11-11 — Pedido de compra de Frisa para mandarle al proveedor (pantalón o
// playera lisa): por prenda, talla y piezas, con precio, subtotal, IVA y total.
const INK = '#1a1a1a'
const MUTED = '#6b6558'
const BORDER = '#dcd6c8'
const AMBER = '#ffc93c'

const s = StyleSheet.create({
  page: { backgroundColor: '#fff', color: INK, fontFamily: 'Helvetica', fontSize: 9, paddingTop: 28, paddingBottom: 40, paddingHorizontal: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  logo: { width: 56, height: 56, objectFit: 'contain' },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 18, marginBottom: 4 },
  dato: { fontSize: 9.5, marginTop: 2 },
  etiqueta: { color: MUTED },
  prenda: { marginTop: 10, marginBottom: 4, fontFamily: 'Helvetica-Bold', fontSize: 11 },
  thead: { flexDirection: 'row', borderBottom: `1pt solid ${INK}`, paddingVertical: 4 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: MUTED, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', paddingVertical: 4, borderBottom: `0.5pt solid ${BORDER}` },
  sub: { flexDirection: 'row', paddingVertical: 4, fontFamily: 'Helvetica-Bold' },
  cTalla: { width: '34%' },
  cPzas: { width: '22%', textAlign: 'right' },
  cPrecio: { width: '22%', textAlign: 'right' },
  cImporte: { width: '22%', textAlign: 'right' },
  totales: { marginTop: 16, marginLeft: 'auto', width: '52%' },
  totFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottom: `0.5pt solid ${BORDER}` },
  totFinal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 6, backgroundColor: AMBER, marginTop: 4 },
  bold: { fontFamily: 'Helvetica-Bold' },
  nota: { marginTop: 16, fontSize: 8.5, color: MUTED },
  pie: { position: 'absolute', bottom: 16, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED },
})

const n = (v) => Number(v || 0).toLocaleString('es-MX')
const peso = (v) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fechaLarga = (d) => (d ? new Date(String(d).length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const cap = (t) => String(t || '').charAt(0) + String(t || '').slice(1).toLowerCase()

// compra: { folio, proveedor, creado_en, fecha_esperada, notas }
// grupos: [{ prenda, lineas: [{ talla, cantidad, precio }] }]
export default function CompraProveedorPdf({ compra, grupos, generado }) {
  const lineas = grupos.flatMap((g) => g.lineas)
  const piezas = lineas.reduce((t, l) => t + (Number(l.cantidad) || 0), 0)
  const conPrecio = lineas.some((l) => l.precio != null)
  const subtotal = lineas.reduce((t, l) => t + (Number(l.cantidad) || 0) * (Number(l.precio) || 0), 0)
  const iva = Math.round(subtotal * 0.16 * 100) / 100
  return (
    <Document title={`SALPER - Pedido de compra ${compra.folio}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.title}>Pedido de compra #{compra.folio}</Text>
            <Text style={s.dato}><Text style={s.etiqueta}>Proveedor: </Text><Text style={s.bold}>{compra.proveedor}</Text></Text>
            <Text style={s.dato}><Text style={s.etiqueta}>Fecha del pedido: </Text>{fechaLarga(compra.creado_en)}</Text>
            {compra.fecha_esperada && <Text style={s.dato}><Text style={s.etiqueta}>Lo necesitamos para: </Text><Text style={s.bold}>{fechaLarga(compra.fecha_esperada)}</Text></Text>}
            <Text style={s.dato}><Text style={s.etiqueta}>Total de piezas: </Text><Text style={s.bold}>{n(piezas)}</Text></Text>
          </View>
          <Image src={logo} style={s.logo} />
        </View>

        {grupos.map((g) => {
          const pz = g.lineas.reduce((t, l) => t + (Number(l.cantidad) || 0), 0)
          const imp = g.lineas.reduce((t, l) => t + (Number(l.cantidad) || 0) * (Number(l.precio) || 0), 0)
          return (
            <View key={g.prenda} wrap={false}>
              <Text style={s.prenda}>{cap(g.prenda)}</Text>
              <View style={s.thead}>
                <Text style={[s.th, s.cTalla]}>Talla</Text>
                <Text style={[s.th, s.cPzas]}>Piezas</Text>
                {conPrecio && <Text style={[s.th, s.cPrecio]}>Precio</Text>}
                {conPrecio && <Text style={[s.th, s.cImporte]}>Importe</Text>}
              </View>
              {g.lineas.map((l, i) => (
                <View key={i} style={s.tr}>
                  <Text style={s.cTalla}>{l.talla}</Text>
                  <Text style={[s.cPzas, s.bold]}>{n(l.cantidad)}</Text>
                  {conPrecio && <Text style={s.cPrecio}>{l.precio != null ? peso(l.precio) : '—'}</Text>}
                  {conPrecio && <Text style={s.cImporte}>{l.precio != null ? peso(l.cantidad * l.precio) : '—'}</Text>}
                </View>
              ))}
              <View style={s.sub}>
                <Text style={s.cTalla}>Total {cap(g.prenda).toLowerCase()}</Text>
                <Text style={s.cPzas}>{n(pz)}</Text>
                {conPrecio && <Text style={s.cPrecio} />}
                {conPrecio && <Text style={s.cImporte}>{peso(imp)}</Text>}
              </View>
            </View>
          )
        })}

        {conPrecio && (
          <View style={s.totales} wrap={false}>
            <View style={s.totFila}><Text>Subtotal</Text><Text>{peso(subtotal)}</Text></View>
            <View style={s.totFila}><Text>IVA 16%</Text><Text>{peso(iva)}</Text></View>
            <View style={s.totFinal}><Text style={s.bold}>Total</Text><Text style={s.bold}>{peso(subtotal + iva)}</Text></View>
          </View>
        )}
        {compra.notas && <Text style={s.nota}>Notas: {compra.notas}</Text>}

        <View style={s.pie} fixed>
          <Text>SALPER · Pedido de compra #{compra.folio}</Text>
          <Text>Generado el {generado}</Text>
        </View>
      </Page>
    </Document>
  )
}
