import { useCallback, useEffect, useState } from 'react'
import { fetchReglas, guardarRegla } from '../../services/produccionService'

const TIPOS = [
  { key: 'meta', titulo: 'Bono por meta', desde: 'Valor generado desde ($)', nota: 'Se toma la fila con el mayor "desde" que no pase del valor generado de la semana.' },
  { key: 'lugar', titulo: 'Bono por lugar', desde: 'Lugar desde', nota: 'Lugar 1 es el mejor; los empates comparten lugar.' },
  { key: 'mejora', titulo: 'Bono por mejora', desde: 'Mejora desde (%)', nota: 'Está en PORCENTAJE: 21 significa 21%.' },
]

export default function ReglasAdmin() {
  const [reglas, setReglas] = useState([])
  const [error, setError] = useState(null)
  const [nuevo, setNuevo] = useState({ tipo: null, desde: '', bono: '' })

  const cargar = useCallback(async () => {
    const { data, error: err } = await fetchReglas()
    if (err) setError(err.message)
    else setReglas(data || [])
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])

  async function guardar(r, cambios) {
    setError(null)
    const { error: err } = await guardarRegla({ id: r.id, tipo: r.tipo, desde: r.desde, bono: r.bono, activa: r.activa, ...cambios })
    if (err) return setError(err.message)
    cargar()
  }

  async function agregar(tipo) {
    setError(null)
    const { error: err } = await guardarRegla({ tipo, desde: Number(nuevo.desde), bono: Number(nuevo.bono), activa: true })
    if (err) return setError(err.message)
    setNuevo({ tipo: null, desde: '', bono: '' })
    cargar()
  }

  return (
    <div>
      {error && <p className="form-error">{error}</p>}
      {TIPOS.map((t) => (
        <div key={t.key} className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>{t.titulo}</h3>
          <p className="template-hint">{t.nota}</p>
          <table className="simple-table">
            <thead>
              <tr>
                <th>{t.desde}</th>
                <th>Bono ($)</th>
                <th>Activa</th>
              </tr>
            </thead>
            <tbody>
              {reglas
                .filter((r) => r.tipo === t.key)
                .sort((a, b) => Number(a.desde) - Number(b.desde))
                .map((r) => (
                  <tr key={r.id} className={r.activa ? '' : 'mt-catalogo__item--off'}>
                    <td>
                      <input className="input input--small" type="number" defaultValue={r.desde} onBlur={(e) => Number(e.target.value) !== Number(r.desde) && guardar(r, { desde: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input className="input input--small" type="number" defaultValue={r.bono} onBlur={(e) => Number(e.target.value) !== Number(r.bono) && guardar(r, { bono: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input type="checkbox" checked={r.activa} onChange={(e) => guardar(r, { activa: e.target.checked })} />
                    </td>
                  </tr>
                ))}
              <tr>
                <td>
                  <input className="input input--small" type="number" placeholder="desde" value={nuevo.tipo === t.key ? nuevo.desde : ''} onChange={(e) => setNuevo({ tipo: t.key, desde: e.target.value, bono: nuevo.tipo === t.key ? nuevo.bono : '' })} />
                </td>
                <td>
                  <input className="input input--small" type="number" placeholder="bono" value={nuevo.tipo === t.key ? nuevo.bono : ''} onChange={(e) => setNuevo({ tipo: t.key, desde: nuevo.tipo === t.key ? nuevo.desde : '', bono: e.target.value })} />
                </td>
                <td>
                  <button type="button" className="btn btn--secondary btn--small" disabled={nuevo.tipo !== t.key || nuevo.desde === '' || nuevo.bono === ''} onClick={() => agregar(t.key)}>
                    + Agregar
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
      <p className="template-hint">Los cambios aplican a las semanas que se calculen o aprueben de ahora en adelante; las ya aprobadas quedan congeladas.</p>
    </div>
  )
}
