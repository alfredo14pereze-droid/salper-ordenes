import { useCallback, useEffect, useState } from 'react'
import Modal from '../talleros/Modal'
import { fetchOperadorasTodas, guardarOperadora } from '../../services/produccionService'

const VACIA = { id: null, folioEmpleado: '', numero: '', nombre: '', puesto: 'COSTURA', participa: true, activo: true }

export default function OperadorasAdmin() {
  const [lista, setLista] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const [errorForm, setErrorForm] = useState(null)

  const cargar = useCallback(async () => {
    const { data, error: err } = await fetchOperadorasTodas()
    if (err) setError(err.message)
    else setLista(data || [])
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])

  async function guardar(e) {
    e.preventDefault()
    setErrorForm(null)
    const { error: err } = await guardarOperadora(form)
    if (err) return setErrorForm(err.message)
    setForm(null)
    cargar()
  }

  async function toggle(o, campo) {
    setError(null)
    const { error: err } = await guardarOperadora({
      id: o.id, folioEmpleado: o.folio_empleado, numero: o.numero_operadora, nombre: o.nombre, puesto: o.puesto,
      participa: campo === 'participa' ? !o.participa_bonos : o.participa_bonos,
      activo: campo === 'activo' ? !o.activo : o.activo,
    })
    if (err) return setError(err.message)
    cargar()
  }

  return (
    <div>
      <button type="button" className="btn btn--secondary btn--small" onClick={() => setForm({ ...VACIA })}>
        + Nueva operadora
      </button>
      {error && <p className="form-error">{error}</p>}
      <div className="revision__tabla-wrap" style={{ marginTop: 10 }}>
        <table className="simple-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>Folio</th>
              <th>Puesto</th>
              <th>Participa en bonos</th>
              <th>Activa</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((o) => (
              <tr key={o.id} className={o.activo ? '' : 'mt-catalogo__item--off'}>
                <td>{o.numero_operadora ?? '—'}</td>
                <td>{o.nombre}</td>
                <td>{o.folio_empleado}</td>
                <td>{o.puesto || '—'}</td>
                <td>
                  <input type="checkbox" checked={o.participa_bonos} onChange={() => toggle(o, 'participa')} />
                </td>
                <td>
                  <input type="checkbox" checked={o.activo} onChange={() => toggle(o, 'activo')} />
                </td>
                <td>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setForm({ id: o.id, folioEmpleado: o.folio_empleado, numero: o.numero_operadora ?? '', nombre: o.nombre, puesto: o.puesto || '', participa: o.participa_bonos, activo: o.activo })}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <Modal title={form.id ? 'Editar operadora' : 'Nueva operadora'} onClose={() => setForm(null)}>
          <form className="order-form" onSubmit={guardar}>
            <div className="form-row">
              <label>
                Folio de empleado *
                <input className="input" value={form.folioEmpleado} onChange={(e) => setForm({ ...form, folioEmpleado: e.target.value.toUpperCase() })} placeholder="EMP036" />
              </label>
              <label>
                Número de operadora
                <input className="input" type="number" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
              </label>
            </div>
            <label>
              Nombre *
              <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </label>
            <label>
              Puesto
              <input className="input" value={form.puesto} onChange={(e) => setForm({ ...form, puesto: e.target.value })} />
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={form.participa} onChange={(e) => setForm({ ...form, participa: e.target.checked })} />
              Participa en bonos
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
              Activa
            </label>
            {errorForm && <p className="form-error">{errorForm}</p>}
            <div className="order-form__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn--primary" disabled={!form.folioEmpleado.trim() || !form.nombre.trim()}>
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
