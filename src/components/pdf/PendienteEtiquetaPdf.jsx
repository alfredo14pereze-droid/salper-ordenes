import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

// Etiqueta chica (80 x 50 mm) para pegar en la bolsa o la prenda.
const styles = StyleSheet.create({
  page: { padding: 8, fontFamily: 'Helvetica', color: '#1a1a1a' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1pt solid #1a1a1a', paddingBottom: 3 },
  folio: { fontFamily: 'Helvetica-Bold', fontSize: 22 },
  tipo: { fontFamily: 'Helvetica-Bold', fontSize: 10, backgroundColor: '#ffc93c', paddingVertical: 2, paddingHorizontal: 6 },
  desc: { fontSize: 10, marginTop: 4, flexGrow: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  label: { fontSize: 6.5, color: '#6b6558', textTransform: 'uppercase' },
  value: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
})

function fecha(d) {
  return new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function corta(t, n = 90) {
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

export default function PendienteEtiquetaPdf({ p }) {
  return (
    <Document title={`Etiqueta ${p.folio}`}>
      <Page size={[227, 142]} style={styles.page}>
        <View style={styles.top}>
          <Text style={styles.folio}>{p.folio}</Text>
          <Text style={styles.tipo}>
            {p.tipo?.nombre} × {p.cantidad}
          </Text>
        </View>
        <Text style={styles.desc}>{corta(p.descripcion)}</Text>
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>{p.es_para_cliente ? 'Cliente' : 'Uso'}</Text>
            <Text style={styles.value}>{p.es_para_cliente ? corta(p.cliente_nombre || '', 24) : 'Se queda en tienda'}</Text>
            {p.es_para_cliente && <Text style={{ fontSize: 8 }}>{p.cliente_telefono}</Text>}
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.label}>Prenda · Talla</Text>
            <Text style={styles.value}>{corta(`${p.prenda || ''} · ${p.talla || ''}`, 20)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.label}>{p.fecha_requerida ? 'Regresa el' : 'Enviado el'}</Text>
            <Text style={styles.value}>{fecha((p.fecha_requerida || p.created_at || '').slice(0, 10))}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
