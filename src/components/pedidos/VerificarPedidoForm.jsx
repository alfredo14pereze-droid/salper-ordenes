import { useState } from 'react'
import { verificarPedidoTienda } from '../../services/pedidosTiendaService'
import { useAuth } from '../../contexts/AuthContext'

// Severidad de la comparación cantidad_recibida vs cantidad_pedida:
// faltante = rojo (peor — no llegó todo), sobrante = ámbar (llegó de más,
// también raro pero menos grave). Sin diferencia = neutro, no se resalta
// — mismos tokens de color que urgencia de entrega (order-card--overdue/
// --warning), no colores nuevos.
function severidad(cantidadRecibida, cantidadPedida) {
  if (cantidadRecibida === '' || cantidadRecibida === null) return null
  const recibida = Number(cantidadRecibida)
  if (recibida < cantidadPedida) return 'danger'
  if (recibida > cantidadPedida) return 'warning'
  return null
}

// Formulario de verificación: por cada artículo, cantidad recibida
// (comparada en vivo contra la cantidad pedida) y precio unitario real,
// más una nota si algo faltó o vino mal. Al guardar, el RPC decide solo
// si el pedido queda "verificado" o "con_problema" según lo que se
// capturó aquí (ver verificar_pedido_tienda).
export default function VerificarPedidoForm({ pedidoId, articulos, onDone, onCancel }) {
  const { profile } = useAuth()
  const [filas, setFilas] = useState(
    articulos.map((a) => ({
      id: a.id,
      nombreArticulo: a.nombre_articulo,
      cantidadPedida: a.cantidad_pedida,
      cantidadRecibida: a.cantidad_recibida ?? '',
      precioUnitario: a.precio_unitario ?? '',
      notaProblema: a.nota_problema || '',
    }))
  )
  const [verificadoPor, setVerificadoPor] = useState(profile?.full_name || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function updateFila(index, patch) {
    setFilas((current) => current.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!verificadoPor.trim()) {
      setError(new Error('Falta indicar quién verificó el pedido.'))
      return
    }
    if (filas.some((f) => f.cantidadRecibida === '')) {
      setError(new Error('Captura la cantidad recibida de cada artículo (0 si no llegó nada de ese artículo).'))
      return
    }

    setSaving(true)
    setError(null)

    const { error: verifyError } = await verificarPedidoTienda({
      pedidoId,
      verificadoPor: verificadoPor.trim(),
      articulos: filas.map((f) => ({
        id: f.id,
        cantidadRecibida: Number(f.cantidadRecibida),
        precioUnitario: f.precioUnitario === '' ? null : Number(f.precioUnitario),
        notaProblema: f.notaProblema.trim() || null,
      })),
    })

    setSaving(false)

    if (verifyError) {
      setError(verifyError)
      return
    }

    onDone?.()
  }

  return (
    <form className="order-form" onSubmit={handleSubmit}>
      <h3 className="section-title section-title--small">Verificar pedido</h3>

      <div className="document-list">
        {filas.map((fila, index) => {
          const sev = severidad(fila.cantidadRecibida, fila.cantidadPedida)
          const rowStyle =
            sev === 'danger'
              ? { borderColor: 'var(--color-danger)', background: 'var(--color-danger-soft)' }
              : sev === 'warning'
                ? { borderColor: 'var(--color-warning)', background: 'var(--color-orange-soft)' }
                : undefined

          return (
            <div key={fila.id} className="document-row" style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <span className="document-row__label">
                {fila.nombreArticulo} <span className="document-row__empty">(pedido: {fila.cantidadPedida})</span>
              </span>

              <div className="form-row-3">
                <label>
                  Cantidad recibida *
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={fila.cantidadRecibida}
                    onChange={(e) => updateFila(index, { cantidadRecibida: e.target.value })}
                  />
                </label>
                <label>
                  Precio unitario real
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input"
                    value={fila.precioUnitario}
                    onChange={(e) => updateFila(index, { precioUnitario: e.target.value })}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  Nota (si algo faltó o vino mal)
                  <input
                    type="text"
                    className="input"
                    value={fila.notaProblema}
                    onChange={(e) => updateFila(index, { notaProblema: e.target.value })}
                    placeholder="Opcional"
                  />
                </label>
              </div>

              {sev === 'danger' && (
                <p className="form-error" style={{ margin: 0 }}>
                  Faltan {fila.cantidadPedida - Number(fila.cantidadRecibida)}.
                </p>
              )}
              {sev === 'warning' && (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-warning)' }}>
                  Llegaron {Number(fila.cantidadRecibida) - fila.cantidadPedida} de más.
                </p>
              )}
            </div>
          )
        })}
      </div>

      <label>
        Quién verificó *
        <input
          type="text"
          className="input"
          value={verificadoPor}
          onChange={(e) => setVerificadoPor(e.target.value)}
        />
      </label>

      {error && <p className="form-error">{error.message}</p>}

      <div className="order-form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar verificación'}
        </button>
      </div>
    </form>
  )
}
