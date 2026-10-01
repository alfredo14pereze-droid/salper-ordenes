import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrder } from '../hooks/useOrder'
import { fetchOrdenEtapas, updateOrdenEtapa, updateOrderStatus, setItemSurtido } from '../services/ordersService'
import { fetchInventarioTelas, marcarCorte } from '../services/movimientosTelaService'
import { fetchOrdenBordados } from '../services/bordadosService'
import { buildRemisionPdfBlob, remisionPdfFileName } from '../utils/generateOrderPdf'
import { useAuth } from '../contexts/AuthContext'
import { estacionDeRol, etapasDeEstacion } from '../config/vistasPorRol'
import { ETAPA_LABELS } from '../lib/constants'
import { Loading, ErrorState } from '../components/common/States'
import PdfPreviewModal from '../components/pdf/PdfPreviewModal'
import Modal from '../components/talleros/Modal'
import OrderDisenosCard from '../components/orders/OrderDisenosCard'

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

// V110 — Parte A: para `corte`, "Tela usada" ya no se escribe directo —
// se captura el trazo (largo del trazo, piezas por trazo, número de
// hojas) POR CADA tela que use la orden, y los metros/piezas se calculan
// solos: metros = largo × hojas, piezas cortadas = piezas por trazo ×
// hojas. Los metros calculados son los que se mandan a marcar_corte (el
// RPC no cambió — sigue esperando {tela_id, cantidad} en metros/kilos).
// Piezas cortadas es solo de referencia en pantalla para el operador —
// no se guarda aparte, no hay a dónde compararla todavía.
function TelaUsadaCorte({ order, onCortado }) {
  const telaIds = useMemo(() => [...new Set((order.items || []).map((i) => i.tela_id).filter(Boolean))], [order.items])
  const [telas, setTelas] = useState({})
  const [trazos, setTrazos] = useState({})
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

  function actualizar(telaId, campo, valor) {
    setTrazos((prev) => ({ ...prev, [telaId]: { ...prev[telaId], [campo]: valor } }))
  }

  function metrosDe(telaId) {
    const t = trazos[telaId] || {}
    const largo = Number(t.largo)
    const hojas = Number(t.hojas)
    return largo > 0 && hojas > 0 ? largo * hojas : null
  }
  function piezasDe(telaId) {
    const t = trazos[telaId] || {}
    const piezas = Number(t.piezas)
    const hojas = Number(t.hojas)
    return piezas > 0 && hojas > 0 ? piezas * hojas : null
  }

  const todasCapturadas = telaIds.every((id) => metrosDe(id) != null && piezasDe(id) != null)

  async function handleConfirmar() {
    setBusy(true)
    setError(null)
    const consumos = telaIds.map((tela_id) => ({ tela_id, cantidad: metrosDe(tela_id) }))
    const { error: err } = await marcarCorte(order.id, consumos)
    setBusy(false)
    if (err) return setError(err)
    onCortado()
  }

  return (
    <div className="estacion-consumo">
      {telaIds.map((telaId) => {
        const t = trazos[telaId] || {}
        const unidad = telas[telaId]?.unidad || ''
        const metros = metrosDe(telaId)
        const piezas = piezasDe(telaId)
        return (
          <div key={telaId} className="estacion-trazo">
            <p className="field-label">
              {telas[telaId]?.nombre || 'Tela'} {unidad ? `(${unidad})` : ''}
            </p>
            <div className="form-row-3">
              <label>
                Largo del trazo {unidad ? `(${unidad})` : ''}
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  className="input"
                  value={t.largo || ''}
                  onChange={(e) => actualizar(telaId, 'largo', e.target.value)}
                />
              </label>
              <label>
                Piezas por trazo
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  className="input"
                  value={t.piezas || ''}
                  onChange={(e) => actualizar(telaId, 'piezas', e.target.value)}
                />
              </label>
              <label>
                Número de hojas
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  className="input"
                  value={t.hojas || ''}
                  onChange={(e) => actualizar(telaId, 'hojas', e.target.value)}
                />
              </label>
            </div>
            {(metros != null || piezas != null) && (
              <p className="estacion-trazo__total">
                {metros != null && `= ${metros.toFixed(2)} ${unidad} de tela`}
                {metros != null && piezas != null && ' · '}
                {piezas != null && `${piezas} piezas cortadas`}
              </p>
            )}
          </div>
        )
      })}
      {error && <p className="form-error">{error.message}</p>}
      {!confirmando ? (
        <button type="button" className="btn btn--primary estacion-btn" disabled={!todasCapturadas} onClick={() => setConfirmando(true)}>
          Cortado
        </button>
      ) : (
        <div className="estacion-acciones">
          <p>
            ¿Confirmas que se usaron{' '}
            {telaIds.map((telaId) => `${metrosDe(telaId).toFixed(2)} ${telas[telaId]?.unidad || ''} de ${telas[telaId]?.nombre || 'tela'}`).join(', ')} y la
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

// V110 — Parte A: cada renglón es dos botones — "Correcta" (la cantidad
// real es la misma que pide la orden, un solo toque) o "Parcial" (abre un
// campo para escribir la cantidad real, de más o de menos, con el mismo
// color rojo/verde de siempre). Reemplaza el input "Real" que antes
// estaba siempre abierto y precargado — ahora hay que decidir cada
// renglón a propósito antes de poder confirmar.
function estadoInicialFila(size) {
  const pedida = Number(size.cantidad) || 0
  if (size.cantidad_surtida == null) return { estado: null, cantidad: '', comentario: size.comentario_surtido || '' }
  const surtida = Number(size.cantidad_surtida)
  return { estado: surtida === pedida ? 'correcta' : 'parcial', cantidad: String(size.cantidad_surtida), comentario: size.comentario_surtido || '' }
}

function FilaSurtido({ size, edit, onCambiar }) {
  const pedida = Number(size.cantidad) || 0
  const real = edit.cantidad === '' ? null : Number(edit.cantidad)
  const colorVar = edit.estado !== 'parcial' || real == null || real === pedida ? null : real < pedida ? 'var(--color-danger)' : 'var(--color-good)'

  return (
    <div className="surtido-fila">
      <div className="surtido-fila__cabeza">
        <span className="surtido-fila__talla">{conTalla(size.talla)}</span>
        <span className="surtido-fila__cantidad">{size.cantidad}</span>
        <div className="surtido-fila__botones">
          <button
            type="button"
            className={'btn' + (edit.estado === 'correcta' ? ' btn--primary' : ' btn--secondary')}
            onClick={() => onCambiar({ estado: 'correcta', cantidad: String(pedida), comentario: '' })}
          >
            Correcta
          </button>
          <button
            type="button"
            className={'btn' + (edit.estado === 'parcial' ? ' btn--primary' : ' btn--secondary')}
            onClick={() => onCambiar({ estado: 'parcial', cantidad: edit.estado === 'parcial' ? edit.cantidad : '' })}
          >
            Parcial
          </button>
        </div>
      </div>
      {edit.estado === 'parcial' && (
        <div className="form-row" style={{ marginTop: 8 }}>
          <label>
            Cantidad real
            <input
              type="number"
              inputMode="numeric"
              min="0"
              className="input"
              style={colorVar ? { borderColor: colorVar, color: colorVar, fontWeight: 700 } : undefined}
              value={edit.cantidad}
              onChange={(e) => onCambiar({ cantidad: e.target.value })}
              autoFocus
            />
          </label>
          <label>
            Comentario
            <input type="text" className="input" value={edit.comentario} onChange={(e) => onCambiar({ comentario: e.target.value })} placeholder="Opcional" />
          </label>
        </div>
      )}
    </div>
  )
}

function EstacionSurtidoTerminado({ order, onConfirmado }) {
  const [ediciones, setEdiciones] = useState(() => (order.items || []).map((item) => (item.sizes || []).map(estadoInicialFila)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)

  function actualizar(itemIndex, sizeIndex, patch) {
    setEdiciones((prev) => prev.map((filas, i) => (i !== itemIndex ? filas : filas.map((f, j) => (j !== sizeIndex ? f : { ...f, ...patch })))))
  }

  const todasDecididas = order.items.every((item, itemIndex) =>
    (item.sizes || []).every((size, sizeIndex) => {
      const e = ediciones[itemIndex][sizeIndex]
      return e.estado === 'correcta' || (e.estado === 'parcial' && e.cantidad !== '')
    })
  )

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
          {(item.sizes || []).map((size, sizeIndex) => (
            <FilaSurtido
              key={sizeIndex}
              size={size}
              edit={ediciones[itemIndex][sizeIndex]}
              onCambiar={(patch) => actualizar(itemIndex, sizeIndex, patch)}
            />
          ))}
        </div>
      ))}
      {error && <p className="form-error">{error.message}</p>}
      <button type="button" className="btn btn--primary estacion-btn" disabled={busy || !todasDecididas} onClick={handleConfirmar}>
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

  // V120 — una estación puede reportar más de una etapa de la misma orden
  // (corte también reporta sublimado), y puede abrir una orden que no
  // tiene ninguna etapa suya (sublimado sube diseños a cualquier orden):
  // solo se pintan botones para las etapas mías que la orden sí tiene.
  const misEtapas = etapasDeEstacion(estacion)
    .map((nombre) => etapas.find((e) => e.etapa === nombre))
    .filter(Boolean)
  const todoTerminado = misEtapas.length > 0 && misEtapas.every((e) => e.estado === 'completado')

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

  async function handleCambiarEtapa(etapa, nuevoEstado) {
    setBusy(true)
    setError(null)
    const { error: err } = await updateOrdenEtapa(order.id, etapa, nuevoEstado)
    setBusy(false)
    if (err) return setError(err)
    refresh()
  }

  return (
    <div className="page estacion-page">
      <Link to="/" className="back-link">
        ← {estacion?.dashboardSublimado ? 'Órdenes de sublimado' : 'Siguientes órdenes'}
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

      {estacion?.disenos && <OrderDisenosCard order={order} className="estacion-disenos" />}

      {misEtapas.length > 0 &&
        (order.status === 'en_confirmacion' ? (
          <button type="button" className="btn btn--primary estacion-btn" disabled={busy} onClick={handleConfirmar}>
            {busy ? 'Guardando…' : 'Confirmar'}
          </button>
        ) : (
          misEtapas.map((et) => {
            const enProceso = et.estado === 'en_proceso'
            const terminada = et.estado === 'completado'
            const esPrincipal = et.etapa === estacion.etapa
            return (
              <div key={et.etapa} className="estacion-acciones">
                {misEtapas.length > 1 && <h3 className="section-title section-title--small">{ETAPA_LABELS[et.etapa] || et.etapa}</h3>}
                <button
                  type="button"
                  className={'btn estacion-btn' + (enProceso || terminada ? ' btn--primary' : ' btn--secondary')}
                  disabled={busy}
                  onClick={() => handleCambiarEtapa(et.etapa, 'en_proceso')}
                >
                  En progreso
                </button>
                {esPrincipal && estacion.consumoPlaceholder ? (
                  terminada ? (
                    <button type="button" className="btn btn--primary estacion-btn" disabled>
                      Cortado
                    </button>
                  ) : (
                    <TelaUsadaCorte order={order} onCortado={refresh} />
                  )
                ) : esPrincipal && estacion.surtidoFinal ? (
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
                    onClick={() => handleCambiarEtapa(et.etapa, 'completado')}
                  >
                    {(esPrincipal && estacion.finalLabel) || 'Finalizado'}
                  </button>
                )}
              </div>
            )
          })
        ))}
      {todoTerminado && <p className="estacion-order__listo">✓ Ya terminaste tu parte de esta orden</p>}
    </div>
  )
}
