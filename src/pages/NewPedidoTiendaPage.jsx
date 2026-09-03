import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPedidoTienda } from '../services/pedidosTiendaService'
import PedidoArticulosEditor from '../components/pedidos/PedidoArticulosEditor'
import RequireRole from '../components/common/RequireRole'
import { canManagePedidosTienda } from '../utils/permissions'
import { useAuth } from '../contexts/AuthContext'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const emptyArticulo = () => ({ nombreArticulo: '', cantidadPedida: '' })

export default function NewPedidoTiendaPage() {
  return (
    <RequireRole allow={canManagePedidosTienda}>
      <NewPedidoTiendaForm />
    </RequireRole>
  )
}

function NewPedidoTiendaForm() {
  const { profile } = useAuth()
  const [proveedor, setProveedor] = useState('')
  const [pedidoPor, setPedidoPor] = useState(profile?.full_name || '')
  const [fechaPedido, setFechaPedido] = useState(todayISO())
  const [notas, setNotas] = useState('')
  const [articulos, setArticulos] = useState([emptyArticulo()])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()

    if (!proveedor.trim() || !pedidoPor.trim() || !fechaPedido) {
      setSubmitError(new Error('Completa los campos requeridos: proveedor, quién pide y fecha del pedido.'))
      return
    }

    // Mismo filtro que OrderItemsEditor/NewOrderPage: descarta la fila
    // vacía sobrante que dejó el auto-agregar.
    const cleanArticulos = articulos
      .filter((a) => a.nombreArticulo.trim() && Number(a.cantidadPedida) > 0)
      .map((a) => ({ nombreArticulo: a.nombreArticulo.trim(), cantidadPedida: Number(a.cantidadPedida) }))

    if (cleanArticulos.length === 0) {
      setSubmitError(new Error('Agrega al menos un artículo con cantidad.'))
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    const { data, error: createError } = await createPedidoTienda({
      proveedor: proveedor.trim(),
      pedidoPor: pedidoPor.trim(),
      fechaPedido,
      notas: notas.trim(),
      articulos: cleanArticulos,
    })

    setSubmitting(false)

    if (createError) {
      setSubmitError(createError)
      return
    }

    navigate(`/pedidos-proveedor/${data.id}`)
  }

  return (
    <div className="page page--narrow">
      <h2 className="section-title">Nuevo pedido a proveedor</h2>

      <form className="order-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Proveedor *
            <input
              type="text"
              className="input"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              placeholder="Ej. Distribuidora Deportiva del Norte"
            />
          </label>
          <label>
            Quién pide *
            <input
              type="text"
              className="input"
              value={pedidoPor}
              onChange={(e) => setPedidoPor(e.target.value)}
            />
          </label>
        </div>

        <label>
          Fecha del pedido *
          <input
            type="date"
            className="input"
            value={fechaPedido}
            onChange={(e) => setFechaPedido(e.target.value)}
          />
        </label>

        <PedidoArticulosEditor articulos={articulos} onChange={setArticulos} />

        <label>
          Notas
          <textarea
            className="input"
            rows={3}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional…"
          />
        </label>

        {submitError && <p className="form-error">{submitError.message}</p>}

        <div className="order-form__actions">
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Crear pedido'}
          </button>
        </div>
      </form>
    </div>
  )
}
