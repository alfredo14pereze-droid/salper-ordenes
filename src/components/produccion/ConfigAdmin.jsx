import { useEffect, useState } from 'react'
import { fetchConfig, guardarConfig } from '../../services/produccionService'

export default function ConfigAdmin() {
  const [precio, setPrecio] = useState('')
  const [segundos, setSegundos] = useState('')
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchConfig().then(({ data }) => {
      const m = Object.fromEntries((data || []).map((x) => [x.clave, x.valor]))
      setPrecio(String(m.precio_por_segundo ?? ''))
      setSegundos(String(m.segundos_jornada ?? ''))
    })
  }, [])

  async function guardar(e) {
    e.preventDefault()
    setMsg(null)
    setError(null)
    const { error: err } = await guardarConfig(Number(precio), Number(segundos))
    if (err) return setError(err.message)
    setMsg('Guardado. Solo aplica a lo que se capture de ahora en adelante.')
  }

  return (
    <form className="order-form card" onSubmit={guardar} style={{ maxWidth: 480 }}>
      <label>
        Precio por segundo ($)
        <input className="input" type="number" step="0.001" min="0" value={precio} onChange={(e) => setPrecio(e.target.value)} />
      </label>
      <label>
        Segundos trabajados por jornada
        <input className="input" type="number" step="1" min="1" value={segundos} onChange={(e) => setSegundos(e.target.value)} />
      </label>
      <p className="template-hint">Los segundos de jornada sirven para calcular las piezas esperadas por día (aviso de captura).</p>
      {error && <p className="form-error">{error}</p>}
      {msg && <p className="captura__flash">{msg}</p>}
      <div className="order-form__actions">
        <button type="submit" className="btn btn--primary">
          Guardar
        </button>
      </div>
    </form>
  )
}
