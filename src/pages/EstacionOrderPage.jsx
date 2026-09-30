import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrder } from '../hooks/useOrder'
import { fetchOrdenEtapas, updateOrdenEtapa, updateOrderStatus, setItemSurtido } from '../services/ordersService'
import { fetchInventarioTelas, marcarCorte } from '../services/movimientosTelaService'
import { fetchOrdenBordados } from '../services/bordadosService'
import { buildRemisionPdfBlob, remisionPdfFileName } from '../utils/generateOrderPdf'
import { useAuth } from '../contexts/AuthContext'
import { estacionDeRol } from '../config/vistasPorRol'
import { Loading, ErrorState } from '../components/common/States'
import PdfPreviewModal from '../components/pdf/PdfPreviewModal'
import Modal from '../components/talleros/Modal'

const conTalla = (talla) => (talla ? `T.${talla}` : '')

function PrendaResumen({ item }) {
  const sizesText = (item.sizes || [])
    .filter((s) => String(s.talla).trim())
    .map((s) => `${conTalla(s.talla)}: ${s.cantidad}`)
    .join(' · ')

  return (
    <div className="estacion-prenda">
      <p className="estacion-prenda__nombre">
        {item.garment || '—'}
        {item.color ? ` · ${item.color}` : ''}
      </p>
      {item.tela_nombre && <p className="estacion-prenda__detalle">Tela: {item.tela_nombre}</p>}
      <p className="estacion-prenda__detalle">{sizesText || 'Sin tallas capturadas'}</p>
    </div>
  )
}

// V102 — Parte 4: para `corte` específicamente, "Tela usada" ya no es un
// placeholder — un campo obligatorio POR CADA tela que use la orden
// (nunca por prenda, para mantenerlo simple), con la unidad de esa tela
// al lado. El botón cambia de "Finalizado" a "Cortado" y pide una
// confirmación simple antes de mandar (marcar_corte inserta el/los
// movimiento(s) consumo_corte Y completa la etapa de corte en una sola
// llamada). El operador no ve estimado/inventario/comparación — eso vive
// aparte, para admin, en OrderCorteResumen.jsx dentro del detalle normal
// de la orden.
function TelaUsadaCorte({ order, onCortado }) {
  const telaIds = useMemo(() => [...new Set((order.items || []).map((i) => i.tela_id).filter(Boolean))], [order.items])
  const [telas, setTelas] = useState({})
  const [cantidades, setCantidades] = useState({})
  const [confirmando, setConfirmando] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchInventarioTelas().then(({ data }) => {
      const map = {}
      for (const t of data || []) map[t.tela_id] = t
      setTelas(map)
    })
  }, [])

  if (telaIds.length === 0) {
    return <p className="form-error">Esta orden no tiene ninguna tela asignada a sus prendas — avisa a tienda antes de cortar.</p>
  }

  const todasCapturadas = telaIds.every((id) => Number(cantidades[id]) > 0)

  async function handleConfirmar() {
    setBusy(true)
    setError(null)
    const consumos = telaIds.map((tela_id) => ({ tela_id, cantidad: Number(cantidades[tela_id]) }))
    const { error: err } = await marcarCorte(order.id, consumos)
    setBusy(false)
    if (err) return setError(err)
    onCortado()
  }

  return (
    <div className="estacion-consumo">
      {telaIds.map((telaId) => (
        <label key={telaId} className="field-label" style={{ display: 'block', marginBottom: 10 }}>
          Tela usada — {telas[telaId]?.nombre || 'Tela'} {telas[telaId]?.unidad ? `(${telas[telaId].unidad})` : ''}
          <input
            type="number"
            min="0.01"
            step="0.01"
            className="input"
            value={cantidades[telaId] || ''}
            onChange={(e) => setCantidades({ ...cantidades, [telaId]: e.target.value })}
            required
          />
        </label>
      ))}
      {error && <p className="form-error">{error.message}</p>}
      {!confirmando ? (
        <button type="button" className="btn btn--primary estacion-btn" disabled={!todasCapturadas} onClick={() => setConfirmando(true)}>
          Cortado
        </button>
      ) : (
        <div className="estacion-acciones">
          <p>
            ¿Confirmas que se usaron{' '}
            {telaIds.map((telaId) => `${cantidades[telaId]} ${telas[telaId]?.unidad || ''} de ${telas[telaId]?.nombre || 'tela'}`).join(', ')} y la
            orden está cortada?
          </p>
          <button type="button" className="btn btn--primary estacion-btn" disabled={busy} onClick={handleConfirmar}>
            {busy ? 'Guardando…' : 'Sí, confirmar'}
          </button>
          <button type="button" className="btn btn--secondary estacion-btn" disabled={busy} onClick={() => setConfirmando(false)}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

// V105 — Parte A: fotos de referencia, de solo lectura, para la vista de
// estación. `bordado` ve SOLO orden_bordados (con ubicación) — el resto
// (corte/sublimado/producción/terminado) ve order.reference_photos, ya
// disponible en `order` sin fetch aparte. Miniaturas chicas para celular;
// tocar una la abre en grande dentro de un Modal (reusa el mismo Modal
// genérico de Talleres).
function Lightbox({ src, alt, onClose }) {
  return (
    <Modal title={alt || 'Foto'} onClose={onClose}>
      <img src={src} alt={alt || ''} style={{ width: '100%', height: 'auto', borderRadius: 6 }} />
    </Modal>
  )
}

function EstacionFotos({ order, esBordado }) {
  const [bordados, setBordados] = useState(null)
  const [ampliada, setAmpliada] = useState(null)

  useEffect(() => {
    if (!esBordado) return
    fetchOrdenBordados(order.id).then(({ data }) => setBordados(data || []))
  }, [esBordado, order.id])

  if (esBordado) {
    if (bordados === null) return <Loading label="Cargando fotos…" />
    const items = order.items || []
    const registrosPorItem = new Map()
    for (const r of bordados) {
      const lista = registrosPorItem.get(r.item_id) || []
      lista.push(r)
      registrosPorItem.set(r.item_id, lista)
    }
    if (bordados.length === 0) {
      return <p className="form-error">Esta orden no tiene foto de bordado.</p>
    }
    return (
      <div className="estacion-fotos">
        <span className="field-label">Fotos de bordado</span>
        {items.map((item, i) => {
          const registros = registrosPorItem.get(item.id) || []
          if (registros.length === 0) return null
          return (
            <div key={item.id || i} style={{ marginBottom: 10 }}>
              <p className="estacion-prenda__detalle">{item.garment || `Prenda ${i + 1}`}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {registros.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    className="estacion-foto-thumb"
                    onClick={() => r.foto_url && setAmpliada({ src: r.foto_url, alt: r.ubicacion })}
                  >
                    {r.foto_url ? <img src={r.foto_url} alt={r.ubicacion} loading="lazy" /> : <span>Sin foto</span>}
                    <span className="estacion-foto-thumb__label">{r.ubicacion}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        {ampliada && <Lightbox src={ampliada.src} alt={ampliada.alt} onClose={() => setAmpliada(null)} />}
      </div>
    )
  }

  const fotos = order.reference_photos || []
  if (fotos.length === 0) return null
  return (
    <div className="estacion-fotos">
      <span className="field-label">Fotos de referencia</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {fotos.map((foto) => (
          <button type="button" key={foto.path} className="estacion-foto-thumb" onClick={() => setAmpliada({ src: foto.url, alt: foto.name })}>
            <img src={foto.url} alt={foto.name} loading="lazy" />
          </button>
        ))}
      </div>
      {ampliada && <Lightbox src={ampliada.src} alt={ampliada.alt} onClose={() => setAmpliada(null)} />}
    </div>
  )
}

// V105 — Parte A: terminado ya no usa "Finalizado" genérico — captura la
// cantidad REAL por talla (precargada con lo pedido, el operador solo
// corrige diferencias) y al confirmar genera la remisión (reusa
// buildRemisionPdfBlob/RemisionPdf.jsx de Fase 2 tal cual, sin duplicar
// lógica) y completa la etapa. Mismo criterio de color que ya usa
// RemisionPdf.jsx (rojo si falta, verde si sobra) — mismos tokens
// --color-danger/--color-good.
function EstacionSurtidoTerminado({ order, onConfirmado }) {
  const [ediciones, setEdiciones] = useState(() =>
    (order.items || []).map((item) => (item.sizes || []).map((s) => ({ cantidad: String(s.cantidad_surtida ?? s.cantidad), comentario: s.comentario_surtido || '' })))
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)

  function actualizar(itemIndex, sizeIndex, patch) {
    setEdiciones((prev) => prev.map((filas, i) => (i !== itemIndex ? filas : filas.map((f, j) => (j !== sizeIndex ? f : { ...f, ...patch })))))
  }

  async function handleConfirmar() {
    setBusy(true)
    setError(null)

    const guardadas = []
    order.items.forEach((item, itemIndex) => {
      ;(item.sizes || []).forEach((size, sizeIndex) => {
        const edit = ediciones[itemIndex][sizeIndex]
        guardadas.push(setItemSurtido(order.id, itemIndex, size.talla, edit.cantidad === '' ? null : Number(edit.cantidad), edit.comentario))
      })
    })
    const resultados = await Promise.all(guardadas)
    const saveError = resultados.find((r) => r.error)?.error
    if (saveError) {
      setBusy(false)
      setError(saveError)
      return
    }

    const { error: etapaError } = await updateOrdenEtapa(order.id, 'terminado', 'completado')
    if (etapaError) {
      setBusy(false)
      setError(etapaError)
      return
    }

    // Orden con los valores recién guardados, sin esperar un refetch —
    // buildRemisionPdfBlob solo necesita los items con cantidad_surtida.
    const ordenConSurtido = {
      ...order,
      items: order.items.map((item, itemIndex) => ({
        ...item,
        sizes: (item.sizes || []).map((size, sizeIndex) => ({
          ...size,
          cantidad_surtida: ediciones[itemIndex][sizeIndex].cantidad === '' ? null : Number(ediciones[itemIndex][sizeIndex].cantidad),
          comentario_surtido: ediciones[itemIndex][sizeIndex].comentario || null,
        })),
      })),
    }
    try {
      const blob = await buildRemisionPdfBlob(ordenConSurtido)
      setPreview({ blob, fileName: remisionPdfFileName(order) })
    } catch (e) {
      setError(new Error(`No se pudo generar el reporte: ${e.message}`))
    }
    setBusy(false)
    onConfirmado?.()
  }

  return (
    <div className="estacion-surtido">
      {order.items.map((item, itemIndex) => (
        <div key={item.id || itemIndex} style={{ marginBottom: 14 }}>
          <p className="estacion-prenda__nombre">{item.garment || `Prenda ${itemIndex + 1}`}</p>
          {(item.sizes || []).map((size, sizeIndex) => {
            const edit = ediciones[itemIndex][sizeIndex]
            const real = edit.cantidad === '' ? null : Number(edit.cantidad)
            const pedida = Number(size.cantidad) || 0
            const colorVar = real == null || real === pedida ? null : real < pedida ? 'var(--color-danger)' : 'var(--color-good)'
            return (
              <div key={sizeIndex} className="form-row" style={{ alignItems: 'flex-end', marginBottom: 6 }}>
                <label style={{ maxWidth: 80 }}>
                  Talla
                  <input type="text" className="input" value={size.talla} disabled readOnly />
                </label>
                <label style={{ maxWidth: 90 }}>
                  Pedido
                  <input type="text" className="input" value={size.cantidad} disabled readOnly />
                </label>
                <label style={{ maxWidth: 110 }}>
                  Real
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    className="input"
                    style={colorVar ? { borderColor: colorVar, color: colorVar, fontWeight: 700 } : undefined}
                    value={edit.cantidad}
                    onChange={(e) => actualizar(itemIndex, sizeIndex, { cantidad: e.target.value })}
                  />
                </label>
                <label style={{ flex: 1 }}>
                  Comentario
                  <input
                    type="text"
                    className="input"
                    value={edit.comentario}
                    onChange={(e) => actualizar(itemIndex, sizeIndex, { comentario: e.target.value })}
                    placeholder="Opcional"
                  />
                </label>
              </div>
            )
          })}
        </div>
      ))}
      {error && <p className="form-error">{error.message}</p>}
      <button type="button" className="btn btn--primary estacion-btn" disabled={busy} onClick={handleConfirmar}>
        {busy ? 'Generando…' : 'Confirmar y generar reporte'}
      </button>
      {preview && <PdfPreviewModal blob={preview.blob} fileName={preview.fileName} onClose={() => setPreview(null)} />}
    </div>
  )
}

// V96/V97 — vista de estación (Parte 1): folio, cliente, prenda+tela+color,
// tallas, y dos botones — "En progreso" / "Finalizado" (pendiente ->
// en_proceso -> completado en orden_etapas) — o "Confirmar" si la orden
// todavía no arranca. Nada de precios/saldos/PDFs/facturación — eso vive
// en OrderDetailPage.jsx, que es donde llegan los demás roles.
export default function EstacionOrderPage() {
  const { id } = useParams()
  const { role } = useAuth()
  const estacion = estacionDeRol(role)
  const { order, loading: loadingOrder, error: errorOrder, refresh: refreshOrder } = useOrder(id)
  const [etapas, setEtapas] = useState([])
  const [loadingEtapas, setLoadingEtapas] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const loadEtapas = useCallback(async () => {
    const { data, error: fetchError } = await fetchOrdenEtapas(id)
    if (!fetchError) setEtapas(data || [])
    setLoadingEtapas(false)
  }, [id])

  useEffect(() => {
    loadEtapas()
  }, [loadEtapas])

  if (loadingOrder || loadingEtapas) return <Loading label="Cargando orden…" />
  if (errorOrder) return <ErrorState error={errorOrder} onRetry={refreshOrder} />
  if (!order) return <ErrorState error={new Error('Esta orden no existe.')} />

  const miEtapa = etapas.find((e) => e.etapa === estacion?.etapa)
  const enProceso = miEtapa?.estado === 'en_proceso'
  const terminada = miEtapa?.estado === 'completado'

  async function refresh() {
    await Promise.all([refreshOrder(), loadEtapas()])
  }

  async function handleConfirmar() {
    setBusy(true)
    setError(null)
    const { error: err } = await updateOrderStatus(order.id, 'confirmado')
    setBusy(false)
    if (err) return setError(err)
    refresh()
  }

  async function handleCambiarEtapa(nuevoEstado) {
    setBusy(true)
    setError(null)
    const { error: err } = await updateOrdenEtapa(order.id, estacion.etapa, nuevoEstado)
    setBusy(false)
    if (err) return setError(err)
    refresh()
  }

  return (
    <div className="page estacion-page">
      <Link to="/" className="back-link">
        ← Siguientes órdenes
      </Link>

      <h2 className="estacion-order__folio">#{order.order_number}</h2>
      <p className="estacion-order__cliente">{order.client_name}</p>

      <div className="estacion-list" style={{ marginTop: 14 }}>
        {(order.items || []).map((item, i) => (
          <PrendaResumen key={item.id || i} item={item} />
        ))}
      </div>

      <EstacionFotos order={order} esBordado={role === 'bordado'} />

      {error && <p className="form-error">{error.message}</p>}

      {order.status === 'en_confirmacion' ? (
        <button type="button" className="btn btn--primary estacion-btn" disabled={busy} onClick={handleConfirmar}>
          {busy ? 'Guardando…' : 'Confirmar'}
        </button>
      ) : (
        <div className="estacion-acciones">
          <button
            type="button"
            className={'btn estacion-btn' + (enProceso || terminada ? ' btn--primary' : ' btn--secondary')}
            disabled={busy}
            onClick={() => handleCambiarEtapa('en_proceso')}
          >
            En progreso
          </button>
          {estacion?.consumoPlaceholder ? (
            terminada ? (
              <button type="button" className="btn btn--primary estacion-btn" disabled>
                Cortado
              </button>
            ) : (
              <TelaUsadaCorte order={order} onCortado={refresh} />
            )
          ) : estacion?.surtidoFinal ? (
            terminada ? (
              <button type="button" className="btn btn--primary estacion-btn" disabled>
                Reporte generado
              </button>
            ) : (
              <EstacionSurtidoTerminado order={order} onConfirmado={refresh} />
            )
          ) : (
            <button
              type="button"
              className={'btn estacion-btn' + (terminada ? ' btn--primary' : ' btn--secondary')}
              disabled={busy}
              onClick={() => handleCambiarEtapa('completado')}
            >
              Finalizado
            </button>
          )}
        </div>
      )}
      {terminada && <p className="estacion-order__listo">✓ Ya terminaste tu parte de esta orden</p>}
    </div>
  )
}
