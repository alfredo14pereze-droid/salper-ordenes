import BordadosMiniaturas from '../components/orders/BordadosMiniaturas'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrder } from '../hooks/useOrder'
import { fetchOrdenEtapas, updateOrdenEtapa, pausarOrdenEtapa, updateOrderStatus, setItemSurtido } from '../services/ordersService'
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
import EtapaCronometro from '../components/orders/EtapaCronometro'
import { medirEtapa } from '../utils/tiemposEtapas'
import { estaPausada, soportaPausa } from '../utils/pausasEtapa'
import { formatMinutosHabiles } from '../utils/horasHabiles'
import { formatDateTime } from '../utils/dates'

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
      {item.lleva_bordado && item.bordado_ubicacion && <p className="estacion-prenda__detalle">Bordado en: {item.bordado_ubicacion}</p>}
      <p className="estacion-prenda__detalle">{sizesText || 'Sin tallas capturadas'}</p>
      {/* V134 — impresiones de la prenda (foto y dónde va), para la etapa de impresión. */}
      {item.lleva_impresion && (
        <>
          <p className="estacion-prenda__detalle">Lleva impresión:</p>
          <BordadosMiniaturas bordados={item.impresiones} />
        </>
      )}
    </div>
  )
}

// V110 — Parte A: para `corte`, "Tela usada" ya no se escribe directo —
// se captura el trazo (largo del trazo, piezas por trazo, número de
// hojas) y los metros/piezas se calculan solos: metros = largo × hojas,
// piezas cortadas = piezas por trazo × hojas. Los metros calculados son
// los que se mandan a marcar_corte (el RPC espera {tela_id, cantidad} en
// metros/kilos). Piezas cortadas es solo de referencia en pantalla.
//
// V131 — varios cortes: cada tela de la orden arranca con un corte, y
// "+ Agregar corte" suma otro (p. ej. manta para pantalón, vivos para
// chamarra) con un campo de texto para decir qué corte es y la tela de la
// que sale (por default una de la orden, pero puede ser otra, como la de los
// vivos). El servidor suma los cortes de cada tela en un solo movimiento y
// guarda las descripciones en su nota (ver marcar_corte en
// schema_v131_corte_multiple_sublimado_samuel.sql).
//
// V142 — tres ajustes para que corte no se quede atorado:
// - Una tela sin unidad de medida ya no bloquea el corte (el catálogo se va
//   llenando poco a poco): se guarda la cantidad y la unidad se completa
//   sola cuando se defina en Catálogos.
// - Una orden sin tela asignada se puede marcar cortada, sin registrar tela.
// - `unaHoja` (órdenes con sublimado): es una sola hoja larga, así que no
//   se pregunta el número de hojas (vale 1).
let cortePk = 0
const nuevoCorte = (telaId, extra = false, hojas = '') => ({ key: ++cortePk, telaId, extra, descripcion: '', largo: '', piezas: '', hojas })

function TelaUsadaCorte({ order, unaHoja = false, onCortado, onCortadoSinTela }) {
  const telaIds = useMemo(() => [...new Set((order.items || []).map((i) => i.tela_id).filter(Boolean))], [order.items])
  const [telas, setTelas] = useState({})
  const hojasInicial = unaHoja ? '1' : ''
  const [cortes, setCortes] = useState(() => telaIds.map((id) => nuevoCorte(id, false, hojasInicial)))
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
    return (
      <div className="estacion-consumo">
        <p className="pantone-hint">
          Esta orden no tiene tela asignada a sus prendas. Puedes marcarla como cortada, pero no se va a registrar la tela usada — avisa a tienda para que
          le pongan la tela.
        </p>
        <button type="button" className="btn btn--primary estacion-btn" onClick={onCortadoSinTela}>
          Cortado
        </button>
      </div>
    )
  }

  const nombreTela = (id) => telas[id]?.nombre || 'Tela'
  const unidadTela = (id) => telas[id]?.unidad || ''
  const cantidadTxt = (id, n) => `${n.toFixed(2)} ${unidadTela(id)}`.trim()

  function actualizar(key, patch) {
    setCortes((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }
  function quitar(key) {
    setCortes((prev) => prev.filter((c) => c.key !== key))
  }

  const metrosDe = (c) => (Number(c.largo) > 0 && Number(c.hojas) > 0 ? Number(c.largo) * Number(c.hojas) : null)
  const piezasDe = (c) => (Number(c.piezas) > 0 && Number(c.hojas) > 0 ? Number(c.piezas) * Number(c.hojas) : null)
  const completo = (c) => metrosDe(c) != null && piezasDe(c) != null && (!c.extra || c.descripcion.trim() !== '')

  // Cada tela de la orden necesita al menos un corte completo; los cortes
  // agregados tienen que estar completos (o quitarse).
  const todasCapturadas = telaIds.every((id) => cortes.some((c) => !c.extra && c.telaId === id && completo(c))) && cortes.filter((c) => c.extra).every(completo)

  const completos = cortes.filter(completo)
  const telasUsadas = [...new Set(completos.map((c) => c.telaId))]
  const totalDeTela = (id) => completos.filter((c) => c.telaId === id).reduce((n, c) => n + metrosDe(c), 0)

  async function handleConfirmar() {
    setBusy(true)
    setError(null)
    const consumos = completos.map((c) => ({
      tela_id: c.telaId,
      cantidad: metrosDe(c),
      nota: c.extra || c.descripcion.trim() ? `${c.descripcion.trim() || 'Corte'}: ${cantidadTxt(c.telaId, metrosDe(c))}` : null,
    }))
    const { error: err } = await marcarCorte(order.id, consumos)
    setBusy(false)
    if (err) return setError(err)
    onCortado()
  }

  return (
    <div className="estacion-consumo">
      {cortes.map((c, i) => {
        const unidad = unidadTela(c.telaId)
        const metros = metrosDe(c)
        const piezas = piezasDe(c)
        return (
          <div key={c.key} className="estacion-trazo">
            <p className="field-label">
              {c.extra ? `Corte ${i + 1}` : nombreTela(c.telaId)} {!c.extra && unidad ? `(${unidad})` : ''}
            </p>
            {c.extra && (
              <div className="form-row">
                <label>
                  ¿Qué corte es? *
                  <input
                    type="text"
                    className="input"
                    value={c.descripcion}
                    onChange={(e) => actualizar(c.key, { descripcion: e.target.value })}
                    placeholder="Ej. Manta para pantalón, vivos de chamarra"
                  />
                </label>
                <label>
                  Tela
                  <select className="input" value={c.telaId} onChange={(e) => actualizar(c.key, { telaId: e.target.value })}>
                    {[...new Set([...telaIds, ...Object.keys(telas)])].map((id) => (
                      <option key={id} value={id}>
                        {nombreTela(id)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className={unaHoja ? 'form-row' : 'form-row-3'}>
              <label>
                {unaHoja ? 'Largo de la hoja' : 'Largo del trazo'} {unidad ? `(${unidad})` : ''}
                <input type="number" inputMode="decimal" min="0.01" step="0.01" className="input" value={c.largo} onChange={(e) => actualizar(c.key, { largo: e.target.value })} />
              </label>
              <label>
                {unaHoja ? 'Piezas en la hoja' : 'Piezas por trazo'}
                <input type="number" inputMode="numeric" min="1" step="1" className="input" value={c.piezas} onChange={(e) => actualizar(c.key, { piezas: e.target.value })} />
              </label>
              {!unaHoja && (
                <label>
                  Número de hojas
                  <input type="number" inputMode="numeric" min="1" step="1" className="input" value={c.hojas} onChange={(e) => actualizar(c.key, { hojas: e.target.value })} />
                </label>
              )}
            </div>
            {(metros != null || piezas != null) && (
              <p className="estacion-trazo__total">
                {metros != null && `= ${cantidadTxt(c.telaId, metros)} de tela`}
                {metros != null && piezas != null && ' · '}
                {piezas != null && `${piezas} piezas cortadas`}
              </p>
            )}
            {c.extra && (
              <button type="button" className="btn btn--ghost btn--small" onClick={() => quitar(c.key)}>
                Quitar este corte
              </button>
            )}
          </div>
        )
      })}
      <button type="button" className="btn btn--secondary estacion-btn" onClick={() => setCortes((prev) => [...prev, nuevoCorte(telaIds[0], true, hojasInicial)])}>
        + Agregar otro corte
      </button>
      {error && <p className="form-error">{error.message}</p>}
      {!confirmando ? (
        <button type="button" className="btn btn--primary estacion-btn" disabled={!todasCapturadas} onClick={() => setConfirmando(true)}>
          Cortado
        </button>
      ) : (
        <div className="estacion-acciones">
          <p>
            ¿Confirmas que se usaron {telasUsadas.map((id) => `${cantidadTxt(id, totalDeTela(id))} de ${nombreTela(id)}`).join(', ')} y la orden está cortada?
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
    // V132 — también cuentan los bordados que tienda capturó dentro de la prenda.
    if (bordados.length === 0 && !items.some((it) => it.bordados?.length > 0)) {
      return <p className="form-error">Esta orden no tiene foto de bordado.</p>
    }
    return (
      <div className="estacion-fotos">
        <span className="field-label">Fotos de bordado</span>
        {items.map((item, i) => {
          const registros = registrosPorItem.get(item.id) || []
          if (registros.length === 0 && !(item.bordados?.length > 0)) return null
          return (
            <div key={item.id || i} style={{ marginBottom: 10 }}>
              <p className="estacion-prenda__detalle">
                {item.garment || `Prenda ${i + 1}`}
                {item.bordado_ubicacion ? ` — Dónde va: ${item.bordado_ubicacion}` : ''}
              </p>
              <BordadosMiniaturas bordados={item.bordados} />
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

// V139 — resumen de tiempos de una etapa ya terminada (solo lectura).
function EtapaTiempoReal({ etapa }) {
  const { minutos } = medirEtapa(etapa)
  return (
    <div className="etapa-tiempo">
      <span className="etapa-tiempo__titulo">✓ Terminada</span>
      {minutos != null && <span className="etapa-tiempo__real">Tiempo real: {formatMinutosHabiles(minutos)} hábiles</span>}
      <span className="etapa-tiempo__horas">
        {etapa.iniciado_en ? `Inició: ${formatDateTime(etapa.iniciado_en)} · ` : ''}
        Terminó: {formatDateTime(etapa.completado_en)}
      </span>
    </div>
  )
}

// V96/V97 — vista de estación (Parte 1): folio, cliente, prenda+tela+color,
// tallas, y dos botones — "Iniciar" / "Terminar" (pendiente ->
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

  // V140 — pausar / reanudar: la etapa sigue "en proceso", solo deja de
  // contar el cronómetro.
  async function handlePausa(etapa, pausar) {
    setBusy(true)
    setError(null)
    const { error: err } = await pausarOrdenEtapa(order.id, etapa, pausar)
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
      {order.created_by_nombre && <p className="pantone-hint">Creada por: {order.created_by_nombre}</p>}

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
            const pausada = estaPausada(et)
            const puedePausar = enProceso && estacion.pausa && soportaPausa(et)
            const finalLabel = estacion.finalLabels?.[et.etapa] || (esPrincipal && estacion.finalLabel) || 'Terminar'
            return (
              <div key={et.etapa} className="estacion-acciones">
                {misEtapas.length > 1 && <h3 className="section-title section-title--small">{ETAPA_LABELS[et.etapa] || et.etapa}</h3>}
                {/* V139 — Iniciar / cronómetro / tiempo real. Una etapa terminada ya no se reabre desde aquí. */}
                {terminada ? (
                  <EtapaTiempoReal etapa={et} />
                ) : enProceso ? (
                  <>
                    <EtapaCronometro etapa={et} />
                    {puedePausar && (
                      <button
                        type="button"
                        className={'btn estacion-btn ' + (pausada ? 'estacion-btn--iniciar' : 'estacion-btn--pausar')}
                        disabled={busy}
                        onClick={() => handlePausa(et.etapa, !pausada)}
                      >
                        {pausada ? '▶ Reanudar' : '⏸ Pausar'}
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn estacion-btn estacion-btn--iniciar"
                    disabled={busy}
                    onClick={() => handleCambiarEtapa(et.etapa, 'en_proceso')}
                  >
                    Iniciar
                  </button>
                )}
                {esPrincipal && estacion.consumoPlaceholder ? (
                  terminada ? (
                    <button type="button" className="btn btn--primary estacion-btn" disabled>
                      Cortado
                    </button>
                  ) : (
                    <TelaUsadaCorte
                      order={order}
                      unaHoja={etapas.some((e) => e.etapa === 'sublimado')}
                      onCortado={refresh}
                      onCortadoSinTela={() => handleCambiarEtapa('corte', 'completado')}
                    />
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
                    className={'btn estacion-btn' + (terminada ? ' btn--primary' : enProceso ? ' estacion-btn--terminar' : ' btn--secondary')}
                    disabled={busy || terminada}
                    onClick={() => handleCambiarEtapa(et.etapa, 'completado')}
                  >
                    {finalLabel}
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
