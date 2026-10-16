import BordadosMiniaturas from '../components/orders/BordadosMiniaturas'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrder } from '../hooks/useOrder'
import { fetchOrdenEtapas, updateOrdenEtapa, pausarOrdenEtapa, updateOrderStatus, setItemSurtido, reportarImpresion } from '../services/ordersService'
import { rosterDePrenda, textoRoster } from '../utils/roster'
import AvisoTallasDanadas from '../components/orders/AvisoTallasDanadas'
import { TINTAS, formatMl, numero, reporteDeEtapa, totalTinta, validarReporteImpresion } from '../utils/impresionReporte'
import { TelaUsadaCorte, CorteTerminado } from '../components/orders/CorteRegistro'
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

// Lista de nombres y números de la prenda (sublimación), para que quien
// diseña la copie y la pegue: toda la lista (cada dato en su columna), solo
// los nombres o solo los números. El texto de la tabla también se puede
// seleccionar a mano.
function RosterEstacion({ item }) {
  const filas = rosterDePrenda(item)
  const [copiado, setCopiado] = useState(null)
  if (filas.length === 0) return null

  async function copiar(modo) {
    const texto = textoRoster(filas, modo)
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      // Sin permiso de portapapeles (o navegador viejo): el método de siempre.
      const area = document.createElement('textarea')
      area.value = texto
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    setCopiado(modo)
    setTimeout(() => setCopiado((actual) => (actual === modo ? null : actual)), 2000)
  }

  const boton = (modo, etiqueta) => (
    <button type="button" className="btn btn--secondary btn--small" onClick={() => copiar(modo)}>
      {copiado === modo ? '✓ Copiado' : etiqueta}
    </button>
  )

  return (
    <div className="estacion-roster">
      <p className="estacion-prenda__detalle">
        <strong>Nombres y números ({filas.length})</strong>
      </p>
      <div className="estacion-roster__botones">
        {boton('lista', 'Copiar lista')}
        {boton('nombres', 'Copiar nombres')}
        {boton('numeros', 'Copiar números')}
      </div>
      <table className="estacion-roster__tabla">
        <thead>
          <tr>
            <th>#</th>
            <th>Nombre</th>
            <th>Talla</th>
            <th>Número</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((r, i) => (
            <tr key={i}>
              <td className="estacion-roster__n">{i + 1}</td>
              <td>{r.nombre || '—'}</td>
              <td>{r.talla || '—'}</td>
              <td>{r.numero || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

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
      <RosterEstacion item={item} />
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

    // V151 — una por una, no todas a la vez: cada llamada reescribe la lista
    // completa de prendas de la orden, y en paralelo unas pisaban a otras.
    let saveError = null
    for (const [itemIndex, item] of order.items.entries()) {
      for (const [sizeIndex, size] of (item.sizes || []).entries()) {
        const edit = ediciones[itemIndex][sizeIndex]
        const { error: err } = await setItemSurtido(order.id, itemIndex, size.talla, edit.cantidad === '' ? null : Number(edit.cantidad), edit.comentario)
        if (err) {
          saveError = err
          break
        }
      }
      if (saveError) break
    }
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

// V146 — reporte de impresión (Samuel): al marcar "Impresa" captura el largo
// del trazo y la tinta de cada color; el total se suma solo. Ya impresa,
// muestra lo reportado y deja corregirlo.
function ImpresionReporte({ order, etapa, onGuardado }) {
  const guardado = reporteDeEtapa(etapa)
  const terminada = etapa.estado === 'completado'
  const [editando, setEditando] = useState(false)
  const [v, setV] = useState(() => ({
    largo: guardado ? String(guardado.largo) : '',
    ...Object.fromEntries(TINTAS.map((t) => [t.key, guardado ? String(guardado[t.key]) : ''])),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (campo, valor) => {
    setError(null)
    setV((prev) => ({ ...prev, [campo]: valor }))
  }

  async function handleGuardar() {
    const falta = validarReporteImpresion(v)
    if (falta) return setError(new Error(falta))
    setSaving(true)
    setError(null)
    const { error: err } = await reportarImpresion(order.id, {
      largo: numero(v.largo),
      ...Object.fromEntries(TINTAS.map((t) => [t.key, numero(v[t.key])])),
    })
    setSaving(false)
    if (err) return setError(err)
    setEditando(false)
    onGuardado?.()
  }

  if (terminada && !editando) {
    return (
      <div className="impresion-reporte">
        {guardado ? (
          <dl className="impresion-reporte__datos">
            <div>
              <dt>Largo del trazo</dt>
              <dd>{guardado.largo} m</dd>
            </div>
            {TINTAS.map((t) => (
              <div key={t.key}>
                <dt>{t.label}</dt>
                <dd>{formatMl(guardado[t.key])}</dd>
              </div>
            ))}
            <div className="impresion-reporte__total">
              <dt>Total de tinta</dt>
              <dd>{formatMl(guardado.total)}</dd>
            </div>
          </dl>
        ) : (
          <p className="pantone-hint">Esta impresión se marcó sin reporte de trazo ni tinta.</p>
        )}
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditando(true)}>
          {guardado ? 'Corregir reporte' : 'Capturar trazo y tinta'}
        </button>
      </div>
    )
  }

  return (
    <div className="impresion-reporte">
      <label>
        Largo del trazo (metros)
        <input type="text" inputMode="decimal" className="input" value={v.largo} onChange={(e) => set('largo', e.target.value)} placeholder="0.00" />
      </label>
      <span className="field-label" style={{ display: 'block', marginTop: 10 }}>
        Consumo de tinta (mL)
      </span>
      <div className="impresion-reporte__tintas">
        {TINTAS.map((t) => (
          <label key={t.key}>
            {t.label}
            <input type="text" inputMode="decimal" className="input" value={v[t.key]} onChange={(e) => set(t.key, e.target.value)} placeholder="0.000" />
          </label>
        ))}
      </div>
      <div className="impresion-reporte__total impresion-reporte__total--form">
        <span>Total de tinta</span>
        <b>{formatMl(totalTinta(v))}</b>
      </div>
      {error && <p className="form-error">{error.message}</p>}
      <button type="button" className="btn estacion-btn estacion-btn--terminar" disabled={saving} onClick={handleGuardar}>
        {saving ? 'Guardando…' : terminada ? 'Guardar corrección' : 'Impresa'}
      </button>
      {terminada && (
        <button type="button" className="btn btn--ghost btn--small" disabled={saving} onClick={() => setEditando(false)}>
          Cancelar
        </button>
      )}
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
      {order.equipo && <p className="estacion-order__cliente">Equipo: {order.equipo}</p>}
      {order.numero_corte && <p className="estacion-order__cliente">Corte: {order.numero_corte}</p>}
      {order.created_by_nombre && <p className="pantone-hint">Creada por: {order.created_by_nombre}</p>}
      <AvisoTallasDanadas order={order} paraEstacion />

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
                    <CorteTerminado order={order} unaHoja={etapas.some((e) => e.etapa === 'sublimado')} onRegistrado={refresh} />
                  ) : (
                    <TelaUsadaCorte
                      order={order}
                      unaHoja={etapas.some((e) => e.etapa === 'sublimado')}
                      onCortado={refresh}
                      onCortadoSinTela={() => handleCambiarEtapa('corte', 'completado')}
                    />
                  )
                ) : et.etapa === 'impresion' ? (
                  // V146 — "Impresa" pide el largo del trazo y la tinta.
                  <ImpresionReporte order={order} etapa={et} onGuardado={refresh} />
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
