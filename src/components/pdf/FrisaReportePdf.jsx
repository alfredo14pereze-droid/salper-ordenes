import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import logo from '../../assets/salper-logo.png'
import MuestraPdf from './MuestraFrisaPdf'

// Reporte genérico de Frisa (utils/frisaReportes.js): título, nota, totales y una tabla.
const INK = '#1a1a1a'
const MUTED = '#6b6558'
const BORDER = '#dcd6c8'
const AMBER = '#ffc93c'

const s = StyleSheet.create({
  page: { backgroundColor: '#fff', color: INK, fontFamily: 'Helvetica', fontSize: 7.5, paddingTop: 24, paddingBottom: 32, paddingHorizontal: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  logo: { width: 44, height: 44, objectFit: 'contain' },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 15, lineHeight: 1.15, marginBottom: 2 },
  sub: { fontSize: 8, color: MUTED, marginTop: 2 },
  totales: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: AMBER, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 6 },
  totalTxt: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginRight: 18 },
  thead: { flexDirection: 'row', borderBottom: `1pt solid ${INK}`, paddingVertical: 3 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: MUTED, textTransform: 'uppercase', paddingRight: 3 },
  tr: { flexDirection: 'row', paddingVertical: 3, borderBottom: `0.5pt solid ${BORDER}` },
  td: { paddingRight: 3 },
  num: { textAlign: 'right' },
  pill: { fontFamily: 'Helvetica-Bold' },
  pie: { position: 'absolute', bottom: 12, left: 24, right: 24, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: MUTED },
  vacio: { marginTop: 20, textAlign: 'center', fontSize: 10, color: MUTED },
})

const n = (v) => (typeof v === 'number' ? v.toLocaleString('es-MX') : String(v ?? ''))
// Ancho relativo: las columnas de texto largo (Nombre) se llevan más espacio.
const peso = (c) => (c.num ? 1 : /nombre/i.test(c.titulo) ? 4 : /^clave$/i.test(c.titulo) ? 2.6 : /planta|proveedor|referencia|notas|usan/i.test(c.titulo) ? 2.2 : 1.6)

export default function FrisaReportePdf({ rep, generado }) {
  const total = rep.columnas.reduce((t, c) => t + peso(c), 0)
  const ancho = (c) => `${(peso(c) / total) * 100}%`
  const horizontal = rep.columnas.length > 7
  return (
    <Document title={`SALPER - Frisa - ${rep.titulo}`}>
      <Page size="LETTER" orientation={horizontal ? 'landscape' : 'portrait'} style={s.page}>
        <View style={s.header} fixed>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.title}>Frisa · {rep.titulo}</Text>
            <Text style={s.sub}>{rep.nota}</Text>
            <Text style={s.sub}>Generado el {generado}</Text>
          </View>
          <Image src={logo} style={s.logo} />
        </View>
        {rep.totales && (
          <View style={s.totales}>
            {Object.entries(rep.totales).map(([k, v]) => <Text key={k} style={s.totalTxt}>{k}: {n(v)}</Text>)}
          </View>
        )}
        <View style={s.thead} fixed>
          {rep.columnas.map((c) => <Text key={c.titulo} style={[s.th, { width: ancho(c) }, c.num ? s.num : null]}>{c.titulo}</Text>)}
        </View>
        {!rep.filas.length && <Text style={s.vacio}>Sin datos para este reporte.</Text>}
        {rep.filas.map((f, i) => {
          const prod = rep.colores?.[i]
          const iNombre = rep.columnas.findIndex((c) => /^(nombre|producto|color)$/i.test(c.titulo))
          return (
            <View key={i} style={f[0] === 'TOTAL' ? [s.tr, { borderTop: `1pt solid ${INK}` }] : s.tr} wrap={false}>
              {rep.columnas.map((c, j) => {
                const estilo = [s.td, { width: ancho(c) }, c.num ? s.num : null, f[0] === 'TOTAL' ? s.pill : null]
                if (j === iNombre && prod) {
                  return <View key={j} style={[...estilo, { flexDirection: 'row' }]}><MuestraPdf producto={prod} /><Text style={{ flex: 1 }}>{n(f[j])}</Text></View>
                }
                return <Text key={j} style={estilo}>{n(f[j])}</Text>
              })}
            </View>
          )
        })}
        <View style={s.pie} fixed>
          <Text>SALPER · Frisa · {rep.titulo}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
