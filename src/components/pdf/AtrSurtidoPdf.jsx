import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import logo from '../../assets/salper-logo.png'

// V215 — Hoja de surtido de una OC de ATR (lo que sale en ESE surtido) y
// lista "Qué nos falta". Mismo estilo que la remisión.
const INK = '#1a1a1a'
const MUTED = '#6b6558'
const BORDER = '#dcd6c8'
const AMBER = '#ffc93c'
const ORANGE = '#e8720c'
const RED = '#c7351f'

const s = StyleSheet.create({
  page: { backgroundColor: '#fff', color: INK, fontFamily: 'Helvetica', fontSize: 9.5, paddingTop: 32, paddingBottom: 40, paddingHorizontal: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  logo: { width: 64, height: 64, objectFit: 'contain' },
  docTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: MUTED, letterSpacing: 1 },
  folioBox: { backgroundColor: AMBER, paddingVertical: 5, paddingHorizontal: 14, marginTop: 6, alignSelf: 'flex-start' },
  folio: { fontFamily: 'Helvetica-Bold', fontSize: 18 },
  section: { marginBottom: 14 },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: ORANGE, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, borderBottom: `1pt solid ${BORDER}`, paddingBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  field: { width: '50%', marginBottom: 6, paddingRight: 10 },
  label: { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 10, marginTop: 2 },
  thead: { flexDirection: 'row', backgroundColor: '#f4f0e6', borderBottom: `1pt solid ${BORDER}`, borderTop: `1pt solid ${BORDER}` },
  tr: { flexDirection: 'row', borderBottom: `0.8pt solid ${BORDER}` },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.3, padding: 6 },
  td: { padding: 6, fontSize: 9 },
  cBata: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  cTalla: { width: 54, textAlign: 'center' },
  cNum: { width: 64, textAlign: 'right' },
  cNumB: { width: 64, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  total: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totalTxt: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  firmas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 48 },
  firma: { width: '42%', borderTop: `1pt solid ${INK}`, paddingTop: 4, fontSize: 8.5, color: MUTED, textAlign: 'center' },
  pie: { position: 'absolute', bottom: 16, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED },
  rojo: { color: RED, fontFamily: 'Helvetica-Bold' },
})

const n = (v) => Number(v || 0).toLocaleString('es-MX')

// surtido: { fecha (texto), usuario, nota, lineas: [{producto, talla, cantidad}], piezas }
// oc: { numero_oc, fecha_oc, fecha_entrega } · resumen: { pedido, surtido } después de este surtido
export function AtrHojaSurtidoPdf({ oc, surtido, resumen, fmt }) {
  return (
    <Document title={`SALPER - Hoja de surtido OC ${oc.numero_oc}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.docTitle}>HOJA DE SURTIDO · ATR</Text>
            <View style={s.folioBox}><Text style={s.folio}>OC {oc.numero_oc}</Text></View>
          </View>
          <Image src={logo} style={s.logo} />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Datos</Text>
          <View style={s.grid}>
            <View style={s.field}><Text style={s.label}>Cliente</Text><Text style={s.value}>ATR</Text></View>
            <View style={s.field}><Text style={s.label}>Fecha de surtido</Text><Text style={s.value}>{fmt.fechaHora(surtido.fecha)}</Text></View>
            <View style={s.field}><Text style={s.label}>Fecha de la OC</Text><Text style={s.value}>{fmt.fecha(oc.fecha_oc)}</Text></View>
            <View style={s.field}><Text style={s.label}>Fecha de entrega</Text><Text style={s.value}>{oc.fecha_entrega ? fmt.fecha(oc.fecha_entrega) : '—'}</Text></View>
            <View style={s.field}><Text style={s.label}>Surtió</Text><Text style={s.value}>{surtido.usuario || '—'}</Text></View>
            {resumen && (
              <View style={s.field}>
                <Text style={s.label}>Avance actual de la OC</Text>
                <Text style={s.value}>{n(resumen.surtido)} de {n(resumen.pedido)} batas{resumen.surtido >= resumen.pedido ? ' · completa' : ` · faltan ${n(resumen.pedido - resumen.surtido)}`}</Text>
              </View>
            )}
          </View>
          {surtido.nota ? <Text style={{ fontSize: 9, marginTop: 2 }}>Nota: {surtido.nota}</Text> : null}
        </View>

        <Text style={s.sectionTitle}>Batas surtidas</Text>
        <View style={s.thead}>
          <Text style={[s.th, s.cBata]}>Bata</Text>
          <Text style={[s.th, s.cTalla]}>Talla</Text>
          <Text style={[s.th, s.cNum]}>Cantidad</Text>
        </View>
        {surtido.lineas.map((l, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={[s.td, s.cBata]}>{l.producto}</Text>
            <Text style={[s.td, s.cTalla]}>{l.talla}</Text>
            <Text style={[s.td, s.cNumB]}>{n(l.cantidad)}</Text>
          </View>
        ))}
        <View style={s.total}><Text style={s.totalTxt}>Total: {n(surtido.piezas)} batas</Text></View>

        <View style={s.firmas}>
          <Text style={s.firma}>Surtió</Text>
          <Text style={s.firma}>Recibió</Text>
        </View>

        <View style={s.pie} fixed>
          <Text>SALPER · Hoja de surtido ATR · OC {oc.numero_oc}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

// filas de atr_faltantes
export function AtrFaltantesPdf({ filas, generado }) {
  const tot = filas.reduce((t, f) => ({ pendiente: t.pendiente + f.pendiente, taller: t.taller + f.en_taller, faltante: t.faltante + f.faltante }), { pendiente: 0, taller: 0, faltante: 0 })
  return (
    <Document title="SALPER - ATR qué nos falta">
      <Page size="LETTER" style={[s.page, { fontSize: 8.5 }]}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.docTitle}>ATR · QUÉ NOS FALTA</Text>
            <Text style={{ fontSize: 8.5, color: MUTED, marginTop: 4 }}>Faltante = pendiente por surtir - existencia - en taller (solo OC abiertas o parciales).</Text>
            <Text style={{ fontSize: 8.5, color: MUTED, marginTop: 2 }}>Generado el {generado}</Text>
          </View>
          <Image src={logo} style={[s.logo, { width: 48, height: 48 }]} />
        </View>
        <View style={[s.folioBox, { flexDirection: 'row', marginBottom: 8 }]}>
          <Text style={[s.totalTxt, { marginRight: 18 }]}>Pendiente {n(tot.pendiente)}</Text>
          <Text style={[s.totalTxt, { marginRight: 18 }]}>En taller {n(tot.taller)}</Text>
          <Text style={s.totalTxt}>Faltan {n(tot.faltante)}</Text>
        </View>
        <View style={s.thead} fixed>
          <Text style={[s.th, s.cBata]}>Bata</Text>
          <Text style={[s.th, s.cTalla]}>Talla</Text>
          <Text style={[s.th, s.cNum]}>Pendiente</Text>
          <Text style={[s.th, s.cNum]}>Existencia</Text>
          <Text style={[s.th, s.cNum]}>En taller</Text>
          <Text style={[s.th, s.cNum]}>Faltante</Text>
        </View>
        {filas.map((f) => (
          <View key={f.producto_id + f.talla} style={s.tr} wrap={false}>
            <Text style={[s.td, s.cBata]}>{f.producto}</Text>
            <Text style={[s.td, s.cTalla]}>{f.talla}</Text>
            <Text style={[s.td, s.cNum]}>{n(f.pendiente)}</Text>
            <Text style={[s.td, s.cNum]}>{n(f.existencia)}</Text>
            <Text style={[s.td, s.cNum]}>{n(f.en_taller)}</Text>
            <Text style={[s.td, s.cNumB, f.faltante > 0 ? s.rojo : null]}>{n(f.faltante)}</Text>
          </View>
        ))}
        <View style={s.pie} fixed>
          <Text>SALPER · ATR qué nos falta</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
