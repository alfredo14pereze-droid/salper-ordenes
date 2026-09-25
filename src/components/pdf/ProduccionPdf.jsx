import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

// V70 — Imprimibles de producción. Terminología: "valor generado" (NO es el sueldo).
const INK = '#1a1a1a'
const MUTED = '#6b6558'
const LINE = '#cfc9bb'
const AMBER = '#e8a916'

const money = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const dia = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

const s = StyleSheet.create({
  page: { backgroundColor: '#fff', color: INK, fontFamily: 'Helvetica', fontSize: 10, padding: 36 },
  brand: { fontFamily: 'Helvetica-Bold', fontSize: 14, letterSpacing: 0.6 },
  sub: { fontSize: 9, color: MUTED, marginTop: 2 },
  nombre: { fontFamily: 'Helvetica-Bold', fontSize: 22, marginTop: 18 },
  semana: { fontSize: 11, color: MUTED, marginTop: 2 },
  kpis: { flexDirection: 'row', gap: 10, marginTop: 16 },
  kpi: { flex: 1, borderWidth: 1, borderColor: INK, borderRadius: 4, padding: 10 },
  kpiLabel: { fontSize: 8.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontFamily: 'Helvetica-Bold', fontSize: 20, marginTop: 4 },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 11, marginTop: 18, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: LINE },
  rowTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, marginTop: 2 },
  bold: { fontFamily: 'Helvetica-Bold' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 130, borderBottomWidth: 1, borderBottomColor: INK, marginTop: 4 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barVal: { fontSize: 7.5, marginBottom: 2 },
  bar: { width: '62%', backgroundColor: '#b9b29f' },
  barActual: { backgroundColor: AMBER },
  labels: { flexDirection: 'row', marginTop: 3 },
  barLabel: { flex: 1, textAlign: 'center', fontSize: 7.5, color: MUTED },
  nota: { fontSize: 8.5, color: MUTED, marginTop: 20 },
  // ranking
  th: { flexDirection: 'row', backgroundColor: INK, paddingVertical: 4, paddingHorizontal: 4 },
  thT: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  tr: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: LINE },
  cLugar: { width: 30 },
  cNombre: { flex: 1 },
  cNum: { width: 86, textAlign: 'right' },
  cNumS: { width: 48, textAlign: 'right' },
})

function Grafica({ serie }) {
  const max = Math.max(...serie.map((x) => x.valor), 1)
  return (
    <View>
      <View style={s.chart}>
        {serie.map((x, i) => (
          <View key={i} style={s.barCol}>
            <Text style={s.barVal}>{Math.round(x.valor).toLocaleString('es-MX')}</Text>
            <View style={[s.bar, i === serie.length - 1 ? s.barActual : null, { height: Math.max((x.valor / max) * 100, 1) }]} />
          </View>
        ))}
      </View>
      <View style={s.labels}>
        {serie.map((x, i) => (
          <Text key={i} style={s.barLabel}>
            {dia(x.fecha_fin)}
          </Text>
        ))}
      </View>
    </View>
  )
}

// Una hoja por persona.
export function HojaOperadora({ semana, persona }) {
  const { op, stats, serie, premio, participantes } = persona
  const cambio = stats.cambioPct
  return (
    <Page size="LETTER" style={s.page}>
      <Text style={s.brand}>SALPER · PRODUCCIÓN SEMANAL</Text>
      <Text style={s.sub}>Semana del {dia(semana.fecha_inicio)} al {dia(semana.fecha_fin)}</Text>
      <Text style={s.nombre}>{op.nombre}</Text>

      <View style={s.kpis}>
        <View style={s.kpi}>
          <Text style={s.kpiLabel}>Valor generado</Text>
          <Text style={s.kpiValue}>{money(stats.actual)}</Text>
        </View>
        <View style={s.kpi}>
          <Text style={s.kpiLabel}>Tu lugar</Text>
          <Text style={s.kpiValue}>{premio ? `${premio.lugar} de ${participantes}` : '—'}</Text>
        </View>
        <View style={s.kpi}>
          <Text style={s.kpiLabel}>Tu premio</Text>
          <Text style={s.kpiValue}>{premio ? money(premio.total_premio) : 'No participa'}</Text>
        </View>
      </View>

      {premio && (
        <View>
          <Text style={s.h2}>Cómo se formó tu premio</Text>
          <View style={s.row}>
            <Text>Bono por meta de valor generado</Text>
            <Text>{money(premio.bono_meta)}</Text>
          </View>
          <View style={s.row}>
            <Text>Bono por lugar (lugar {premio.lugar})</Text>
            <Text>{money(premio.bono_lugar)}</Text>
          </View>
          <View style={s.row}>
            <Text>Bono por mejora ({premio.mejora_pct == null ? 'sin base' : `${Number(premio.mejora_pct).toFixed(1)}%`} vs semana anterior)</Text>
            <Text>{money(premio.bono_mejora)}</Text>
          </View>
          <View style={s.rowTotal}>
            <Text style={s.bold}>Total del premio</Text>
            <Text style={s.bold}>{money(premio.total_premio)}</Text>
          </View>
        </View>
      )}

      <Text style={s.h2}>Tus últimas semanas</Text>
      <Grafica serie={serie} />

      <Text style={s.h2}>Contra tu propio promedio</Text>
      <View style={s.row}>
        <Text>Promedio de tus 4 semanas anteriores</Text>
        <Text>{stats.promedio4 == null ? '—' : money(stats.promedio4)}</Text>
      </View>
      <View style={s.row}>
        <Text>Esta semana</Text>
        <Text>
          {money(stats.actual)}
          {cambio == null ? '' : `  (${cambio >= 0 ? '+' : ''}${cambio.toFixed(1)}%)`}
        </Text>
      </View>
      <View style={s.row}>
        <Text>Tu mejor semana</Text>
        <Text>{stats.mejor ? `${money(stats.mejor.valor)} (${dia(stats.mejor.fecha_fin)})` : '—'}</Text>
      </View>
      <Text style={[s.bold, { marginTop: 8 }]}>{stats.clasificacion}</Text>

      <Text style={s.nota}>El valor generado mide lo que produjiste esta semana; no es tu sueldo. Con él se calculan los premios.</Text>
    </Page>
  )
}

export function ProduccionOperadorasDoc({ semana, personas }) {
  return (
    <Document>
      {personas.map((p) => (
        <HojaOperadora key={p.op.id} semana={semana} persona={p} />
      ))}
    </Document>
  )
}

export function ProduccionRankingDoc({ semana, filas }) {
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <Text style={s.brand}>SALPER · RANKING DE PRODUCCIÓN</Text>
        <Text style={s.sub}>Semana del {dia(semana.fecha_inicio)} al {dia(semana.fecha_fin)} · Valor generado (no es sueldo)</Text>
        <View style={[s.th, { marginTop: 14 }]}>
          <Text style={[s.thT, s.cLugar]}>Lugar</Text>
          <Text style={[s.thT, s.cNombre]}>Operadora</Text>
          <Text style={[s.thT, s.cNum]}>Semana actual</Text>
          <Text style={[s.thT, s.cNum]}>Semana anterior</Text>
          <Text style={[s.thT, s.cNum]}>Mejora</Text>
        </View>
        {filas.map((f) => (
          <View key={f.operadora_id} style={s.tr} wrap={false}>
            <Text style={s.cLugar}>{f.lugar}</Text>
            <Text style={s.cNombre}>{f.nombre}</Text>
            <Text style={[s.cNum, s.bold]}>{money(f.valor_generado)}</Text>
            <Text style={s.cNum}>{f.valor_anterior == null ? '—' : money(f.valor_anterior)}</Text>
            <Text style={s.cNum}>{f.mejora_pct == null ? 'Sin base' : `${f.mejora_pct >= 0 ? '+' : ''}${Number(f.mejora_pct).toFixed(1)}%`}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}
