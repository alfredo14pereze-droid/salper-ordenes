import { useMemo, useState } from 'react'
import { TIPOS_MOVIMIENTO, etiquetaTipo, efecto, formatNum, formatFecha } from '../../utils/frisaConsignacion'

const signo = (n) => (n > 0 ? '+' : '') + formatNum(n)

// Pantalla 6 — historial de movimientos con filtros por SKU, planta y tipo.
export default function FrisaHistorial({ datos }) {
  const [sku, setSku] = useState('')
  const [planta, setPlanta] = useState('')
  const [tipo, setTipo] = useState('')
  const [limite, setLimite] = useState(200)
  const prod = useMemo(() => Object.fromEntries(datos.productos.map((p) => [p.id, p])), [datos])
  const pl = useMemo(() => Object.fromEntries(datos.plantas.map((p) => [p.id, p])), [datos])

  const filtrados = datos.movimientos.filter((m) => (!sku || m.producto_id === sku) && (!tipo || m.tipo === tipo)
    && (!planta || (planta === 'bodega' ? m.planta_id == null || m.tipo === 'entrega' : m.planta_id === planta)))

  return (
    <div>
      <div className="frisa-form__fila">
        <label>
          <span className="field-label">SKU</span>
          <select className="input" value={sku} onChange={(e) => setSku(e.target.value)}>
            <option value="">Todos</option>
            {datos.productos.map((p) => <option key={p.id} value={p.id}>{p.sku}</option>)}
          </select>
        </label>
        <label>
          <span className="field-label">Planta</span>
          <select className="input" value={planta} onChange={(e) => setPlanta(e.target.value)}>
            <option value="">Todas</option>
            <option value="bodega">Bodega SALPER</option>
            {datos.plantas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label>
          <span className="field-label">Tipo</span>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {TIPOS_MOVIMIENTO.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
      </div>
      <p className="frisa__sub">{formatNum(filtrados.length)} movimiento(s)</p>
      <div className="revision__tabla-wrap">
        <table className="simple-table frisa-tabla">
          <thead>
            <tr><th>Fecha</th><th>Tipo</th><th>SKU</th><th>Planta</th><th className="num">Bodega</th><th className="num">Planta</th><th>Referencia / notas</th><th>Capturó</th></tr>
          </thead>
          <tbody>
            {filtrados.slice(0, limite).map((m) => {
              const e = efecto(m)
              return (
                <tr key={m.id}>
                  <td>{formatFecha(m.fecha)}</td>
                  <td>{etiquetaTipo(m.tipo)}</td>
                  <td>{prod[m.producto_id]?.sku}</td>
                  <td>{m.planta_id ? pl[m.planta_id]?.nombre : 'Bodega SALPER'}</td>
                  <td className="num">{e.bodega ? signo(e.bodega) : ''}</td>
                  <td className="num">
                    {m.tipo === 'ajuste_confirmacion' ? <>{signo(e.planta)} <span className="frisa__sub">(confirmó {formatNum(m.confirmado)})</span></> : e.planta ? signo(e.planta) : ''}
                  </td>
                  <td>{[m.referencia, m.notas].filter(Boolean).join(' · ')}{m.es_prueba && <span className="frisa__prueba">prueba</span>}</td>
                  <td className="frisa__sub">{m.creado_por_nombre || ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {filtrados.length > limite && (
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setLimite((n) => n + 200)}>Mostrar más</button>
      )}
    </div>
  )
}
