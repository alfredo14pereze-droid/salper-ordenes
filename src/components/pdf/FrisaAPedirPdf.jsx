import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import logo from '../../assets/salper-logo.png'
import { ESTADOS } from '../../utils/frisaNiveles'
import { colorPlayera, COLORES_PLAYERA, nombreFrisa } from '../../utils/frisaColores'

// V184 — Frisa: lista A PEDIR (claves en CRÍTICO o PEDIR), para producción.
const INK = '#1a1a1a'
const MUTED = '#6b6558'
const BORDER = '#dcd6c8'
const AMBER = '#ffc93c'
const RED = '#c0392b'
const ORANGE = '#a24d09'

const s = StyleSheet.create({
  page: { backgroundColor: '#fff', color: INK, fontFamily: 'Helvetica', fontSize: 8.5, paddingTop: 26, paddingBottom: 34, paddingHorizontal: 28 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  logo: { width: 48, height: 48, objectFit: 'contain' },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 16 },
  sub: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  totales: { flexDirection: 'row', backgroundColor: AMBER, paddingVertical: 5, paddingHorizontal: 10, marginBottom: 8 },
  totalTxt: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginRight: 22 },
  thead: { flexDirection: 'row', borderBottom: `1pt solid ${INK}`, paddingVertical: 3 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: MUTED, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', paddingVertical: 4, borderBottom: `0.5pt solid ${BORDER}` },
  cClave: { width: 118, paddingRight: 4, fontFamily: 'Helvetica-Bold' },
  cNombre: { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 6 },
  cColor: { width: 58, paddingRight: 4 },
  pill: { fontFamily: 'Helvetica-Bold', paddingHorizontal: 3, paddingVertical: 1, borderRadius: 2 },
  cNum: { width: 38, textAlign: 'right' },
  cEstado: { width: 50, textAlign: 'center' },
  cPedir: { width: 46, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 10 },
  critico: { color: RED, fontFamily: 'Helvetica-Bold' },
  pedir: { color: ORANGE, fontFamily: 'Helvetica-Bold' },
  pie: { position: 'absolute', bottom: 14, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED },
})

const n = (v) => Number(v || 0).toLocaleString('es-MX')

export default function FrisaAPedirPdf({ lista, cfg, generado }) {
  const piezas = lista.reduce((t, f) => t + (f.niveles.aPedir || 0), 0)
  const criticos = lista.filter((f) => f.niveles.estado === 'critico').length
  return (
    <Document title="SALPER - Frisa A PEDIR">
      <Page size="LETTER" style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.title}>Frisa · lista A PEDIR</Text>
            <Text style={s.sub}>
              Disponible = real en el almacén de la fábrica - apartado. Demanda = consumo 2026 ÷ {cfg.dias_periodo} días · mínimo {cfg.dias_minimo} d · reorden {cfg.dias_reorden} d · máximo {cfg.dias_maximo} d.
            </Text>
            <Text style={s.sub}>Generado el {generado}</Text>
          </View>
          <Image src={logo} style={s.logo} />
        </View>
        <View style={s.totales}>
          <Text style={s.totalTxt}>{lista.length} claves</Text>
          <Text style={[s.totalTxt, { color: RED }]}>{criticos} CRÍTICO</Text>
          <Text style={[s.totalTxt, { color: ORANGE }]}>{lista.length - criticos} PEDIR</Text>
          <Text style={s.totalTxt}>{n(piezas)} piezas a pedir</Text>
        </View>
        <View style={s.thead} fixed>
          <Text style={[s.th, s.cClave]}>Clave</Text>
          <Text style={[s.th, s.cNombre]}>Nombre</Text>
          <Text style={[s.th, s.cColor]}>Color</Text>
          <Text style={[s.th, s.cNum]}>Disp.</Text>
          <Text style={[s.th, s.cNum]}>Mín.</Text>
          <Text style={[s.th, s.cNum]}>Reord.</Text>
          <Text style={[s.th, s.cNum]}>Máx.</Text>
          <Text style={[s.th, s.cEstado]}>Estado</Text>
          <Text style={[s.th, s.cPedir, { fontSize: 7 }]}>A pedir</Text>
        </View>
        {lista.map((f) => (
          <View key={f.id || f.clave} style={s.tr} wrap={false}>
            <Text style={s.cClave}>{f.clave}</Text>
            <View style={s.cNombre}><Text style={colorPlayera(f) ? [s.pill, { color: COLORES_PLAYERA[colorPlayera(f)].texto, backgroundColor: COLORES_PLAYERA[colorPlayera(f)].fondo }] : null}>{nombreFrisa(f.nombre)}</Text></View>
            <Text style={s.cColor}>{f.color || ''}</Text>
            <Text style={s.cNum}>{n(f.disponible ?? f.stock_actual)}</Text>
            <Text style={s.cNum}>{n(f.niveles.minimo)}</Text>
            <Text style={s.cNum}>{n(f.niveles.reorden)}</Text>
            <Text style={s.cNum}>{n(f.niveles.maximo)}</Text>
            <Text style={[s.cEstado, f.niveles.estado === 'critico' ? s.critico : s.pedir]}>{ESTADOS[f.niveles.estado].label}</Text>
            <Text style={s.cPedir}>{n(f.niveles.aPedir)}</Text>
          </View>
        ))}
        <View style={s.pie} fixed>
          <Text>SALPER · Frisa niveles de inventario</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
