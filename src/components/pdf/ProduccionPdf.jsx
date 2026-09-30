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
  // V109 — catálogos (operaciones/operadoras/reglas): columnas genéricas
  // reusadas entre las 3 tablas, en vez de definir un set por tabla.
  colXs: { width: 40, textAlign: 'center' },
  colSm: { width: 60, textAlign: 'center' },
  colMd: { width: 90 },
  colFlex: { flex: 1 },
  catTitleBox: { backgroundColor: AMBER, paddingVertical: 4, paddingHorizontal: 12, marginTop: 6, alignSelf: 'flex-start' },
  catTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  catGrupo: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 16, marginBottom: 4 },
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

const hoy = () => new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

// V109 — "Imprimir" en Admin producción (Operaciones/Operadoras/Reglas de
// premios): un catálogo imprimible por sección, tal cual está en ese
// momento (no es un histórico ni compara semanas, a diferencia de los
// otros 2 documentos de este archivo).
export function CatalogoOperacionesDoc({ operaciones }) {
  return (
    <Document title="Catálogo de operaciones · SALPER">
      <Page size="LETTER" style={s.page}>
        <Text style={s.brand}>SALPER · CATÁLOGO DE OPERACIONES</Text>
        <Text style={s.sub}>{operaciones.length} operaciones · generado el {hoy()}</Text>
        <View style={[s.th, { marginTop: 14 }]}>
          <Text style={[s.thT, s.colSm]}>Folio</Text>
          <Text style={[s.thT, s.colMd]}>Prenda</Text>
          <Text style={[s.thT, s.colFlex]}>Parte</Text>
          <Text style={[s.thT, s.colFlex]}>Operación</Text>
          <Text style={[s.thT, s.colXs]}>Seg.</Text>
          <Text style={[s.thT, s.colSm]}>Estado</Text>
        </View>
        {operaciones.map((o) => (
          <View key={o.folio} style={s.tr} wrap={false}>
            <Text style={s.colSm}>{o.folio}</Text>
            <Text style={s.colMd}>{o.prenda}</Text>
            <Text style={s.colFlex}>{o.parte}</Text>
            <Text style={s.colFlex}>{o.operacion}</Text>
            <Text style={s.colXs}>{o.segundos}</Text>
            <Text style={s.colSm}>{o.activa ? 'Activa' : 'Inactiva'}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}

export function CatalogoOperadorasDoc({ operadoras }) {
  return (
    <Document title="Catálogo de operadoras · SALPER">
      <Page size="LETTER" style={s.page}>
        <Text style={s.brand}>SALPER · CATÁLOGO DE OPERADORAS</Text>
        <Text style={s.sub}>{operadoras.length} operadoras · generado el {hoy()}</Text>
        <View style={[s.th, { marginTop: 14 }]}>
          <Text style={[s.thT, s.colXs]}>#</Text>
          <Text style={[s.thT, s.colFlex]}>Nombre</Text>
          <Text style={[s.thT, s.colMd]}>Folio</Text>
          <Text style={[s.thT, s.colMd]}>Puesto</Text>
          <Text style={[s.thT, s.colSm]}>Bonos</Text>
          <Text style={[s.thT, s.colSm]}>Activa</Text>
        </View>
        {operadoras.map((o) => (
          <View key={o.id} style={s.tr} wrap={false}>
            <Text style={s.colXs}>{o.numero_operadora ?? '—'}</Text>
            <Text style={s.colFlex}>{o.nombre}</Text>
            <Text style={s.colMd}>{o.folio_empleado}</Text>
            <Text style={s.colMd}>{o.puesto || '—'}</Text>
            <Text style={s.colSm}>{o.participa_bonos ? 'Sí' : 'No'}</Text>
            <Text style={s.colSm}>{o.activo ? 'Sí' : 'No'}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}

const REGLA_GRUPOS = [
  { key: 'meta', titulo: 'Bono por meta', desde: 'Valor generado desde' },
  { key: 'lugar', titulo: 'Bono por lugar', desde: 'Lugar desde' },
  { key: 'mejora', titulo: 'Bono por mejora', desde: 'Mejora desde (%)' },
]

export function CatalogoReglasDoc({ reglas }) {
  return (
    <Document title="Reglas de premios · SALPER">
      <Page size="LETTER" style={s.page}>
        <Text style={s.brand}>SALPER · REGLAS DE PREMIOS</Text>
        <Text style={s.sub}>Generado el {hoy()} · montos en pesos, no confidencial para quien ya los administra</Text>
        {REGLA_GRUPOS.map((g) => {
          const filas = reglas.filter((r) => r.tipo === g.key).sort((a, b) => Number(a.desde) - Number(b.desde))
          return (
            <View key={g.key}>
              <Text style={s.catGrupo}>{g.titulo}</Text>
              <View style={s.th}>
                <Text style={[s.thT, s.colFlex]}>{g.desde}</Text>
                <Text style={[s.thT, s.colMd]}>Bono</Text>
                <Text style={[s.thT, s.colSm]}>Activa</Text>
              </View>
              {filas.length === 0 && (
                <View style={s.tr}>
                  <Text style={s.colFlex}>Sin reglas definidas.</Text>
                </View>
              )}
              {filas.map((r) => (
                <View key={r.id} style={s.tr} wrap={false}>
                  <Text style={s.colFlex}>{g.key === 'mejora' ? `${r.desde}%` : r.desde}</Text>
                  <Text style={s.colMd}>{money(r.bono)}</Text>
                  <Text style={s.colSm}>{r.activa ? 'Sí' : 'No'}</Text>
                </View>
              ))}
            </View>
          )
        })}
      </Page>
    </Document>
  )
}
