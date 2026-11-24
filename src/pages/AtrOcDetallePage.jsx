import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { ErrorState, Loading } from '../components/common/States'
import AyudaModulo from '../components/common/AyudaModulo'
import Modal from '../components/talleros/Modal'
import { useAuth } from '../contexts/AuthContext'
import { canCargarAtr, canEntregarAtr, canFacturarAtr, canOcAtr, canVerAtr } from '../utils/permissions'
import { cancelarAtrOc, confirmarEntregaAtr, deshacerSurtidoAtr, fetchAtrOcDetalle, fetchAtrOcLista, fetchAtrSurtidosOc, urlPdfOcAtr } from '../services/atrService'
import AtrSurtirModal from '../components/atr/AtrSurtirModal'
import AtrBata from '../components/atr/AtrBata'
import PdfPreviewModal from '../components/pdf/PdfPreviewModal'
import { atrHojaSurtidoFileName, buildAtrHojaSurtidoBlob } from '../utils/generateAtrPdf'
import { ESTADOS_OC, pctSurtido, surtidoDesdeRpc, urgenciaEntrega } from '../utils/atrOc'
import { daysUntil, formatDate, formatDateTime } from '../utils/dates'
import '../components/atr/atr.css'

// V215 — Detalle de una OC de ATR: datos, PDF en vista previa y líneas con
// pedido / surtido / pendiente / existencia actual. Cancelar pide motivo y
// avisa que lo ya surtido NO se revierte solo. Surtir (parcial o total),
// hoja de surtido en PDF y deshacer un surtido (signo contrario, sin borrar).
export default function AtrOcDetallePage() {
  return (
    <RequireRole allow={canVerAtr}>
      <AtrOcDetalle />
    </RequireRole>
  )
}

const n = (x) => Number(x || 0).toLocaleString('es-MX')

function AtrOcDetalle() {
  const { id } = useParams()
  const { role } = useAuth()
  const [oc, setOc] = useState(undefined)
  const [lineas, setLineas] = useState(null)
  const [error, setError] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [verPdf, setVerPdf] = useState(false)
  const [errPdf, setErrPdf] = useState(null)
  const [cancelar, setCancelar] = useState(false)
  const [surtidos, setSurtidos] = useState([])
  const [surtir, setSurtir] = useState(false)
  const [hoja, setHoja] = useState(null) // { blob, fileName }
  const [deshacer, setDeshacer] = useState(null) // surtido
  const [aviso, setAviso] = useState(null)
  const [okMsg, setOkMsg] = useState(null)

  const cargar = useCallback(async () => {
    setError(null)
    const [l, d] = await Promise.all([fetchAtrOcLista(), fetchAtrOcDetalle(Number(id))])
    if (l.error || d.error) return setError(l.error || d.error)
    const laOc = (l.data || []).find((x) => String(x.id) === String(id)) || null
    const ls = d.data || []
    const m = await fetchAtrSurtidosOc(Number(id))
    if (m.error) return setError(m.error)
    setOc(laOc)
    setLineas(ls)
    const gs = (m.data || []).map(surtidoDesdeRpc)
    setSurtidos(gs)
    return { oc: laOc, surtidos: gs }
  }, [id])

  async function verHoja(oc2, surtido) {
    setAviso(null)
    try {
      const blob = await buildAtrHojaSurtidoBlob(oc2, surtido, { pedido: oc2.pedido, surtido: oc2.surtido })
      setHoja({ blob, fileName: atrHojaSurtidoFileName(oc2, surtido) })
    } catch (e) {
      setAviso('No se pudo generar la hoja de surtido: ' + (e.message || e))
    }
  }

  async function surtidoListo(surtidoId) {
    setSurtir(false)
    const r = await cargar()
    const nuevo = r?.surtidos.find((g) => g.surtido_id === surtidoId)
    if (r?.oc && nuevo) verHoja(r.oc, nuevo)
  }

  useEffect(() => {
    cargar()
  }, [cargar])

  async function abrirPdf() {
    setErrPdf(null)
    if (verPdf) return setVerPdf(false)
    if (!pdfUrl) {
      const { data, error: e } = await urlPdfOcAtr(oc.pdf_url)
      if (e) return setErrPdf('No se pudo abrir el PDF: ' + e.message)
      setPdfUrl(data)
    }
    setVerPdf(true)
  }

  if (error) return <div className="page"><ErrorState error={error} onRetry={cargar} /></div>
  if (oc === undefined || !lineas) return <div className="page"><Loading /></div>
  if (oc === null) {
    return (
      <div className="page atr">
        <Link to="/atr?tab=oc" className="atr-volver">← Órdenes de compra</Link>
        <p>No existe esa orden de compra.</p>
      </div>
    )
  }

  const urg = urgenciaEntrega(oc.estado, oc.fecha_entrega ? daysUntil(oc.fecha_entrega) : null)
  const pend = lineas.reduce((s, l) => s + l.pendiente, 0)

  return (
    <div className="page atr">
      <Link to="/atr?tab=oc" className="atr-volver">← Órdenes de compra</Link>
      <div className="section-header">
        <h2 className="section-title">OC {oc.numero_oc} <AyudaModulo id="atr" /></h2>
        <div className="atr-acciones">
          {oc.pdf_url && (
            <button type="button" className="btn btn--ghost btn--small" onClick={abrirPdf}>{verPdf ? 'Ocultar PDF' : 'Ver PDF'}</button>
          )}
          {canEntregarAtr(role) && (oc.estado === 'abierta' || oc.estado === 'parcial') && (
            <button type="button" className="btn btn--primary" onClick={() => setSurtir(true)}>Surtir</button>
          )}
          {canOcAtr(role) && oc.estado !== 'cancelada' && (
            <button type="button" className="btn btn--ghost btn--small atr-btn-peligro" onClick={() => setCancelar(true)}>Cancelar OC</button>
          )}
        </div>
      </div>

      <div className="atr-oc-cabecera">
        <span className={`atr-chip atr-chip--${oc.estado}`}>{ESTADOS_OC[oc.estado]}</span>
        <span>Fecha OC: <strong>{formatDate(oc.fecha_oc)}</strong></span>
        <span>Entrega: <strong>{oc.fecha_entrega ? formatDate(oc.fecha_entrega) : '—'}</strong></span>
        {oc.estado !== 'cancelada' && <span className={'order-card__due' + (urg.nivel ? ` order-card__due--${urg.nivel}` : '')}>{urg.texto}</span>}
        <span>Surtido: <strong>{n(oc.surtido)} / {n(oc.pedido)}</strong> ({pctSurtido(oc)}%)</span>
      </div>
      <p className="atr-muted atr-oc-meta">
        Subida por {oc.creado_por_nombre || '—'} el {formatDateTime(oc.creado_en)}
        {oc.notas ? <> · Notas: {oc.notas}</> : null}
      </p>
      {(oc.estado === 'abierta' || oc.estado === 'parcial') && (() => {
        // Esta OC sola contra lo disponible hoy (existencia − apartado por facturar).
        const disp = (l) => Math.max(0, l.disponible ?? l.existencia)
        const faltan = lineas.filter((l) => l.pendiente > disp(l))
        const hay = lineas.reduce((t, l) => t + Math.min(l.pendiente, disp(l)), 0)
        return faltan.length === 0 ? (
          <p className="atr-oc-aviso atr-oc-aviso--ok"><span className="frisa-nivel frisa-nivel--verde">Se puede surtir</span> Hay inventario para surtir todo lo pendiente ({n(pend)} batas).</p>
        ) : (
          <p className="atr-oc-aviso atr-oc-aviso--falta">
            <span className="frisa-nivel frisa-nivel--rojo">Faltan piezas</span>{' '}
            Falta: {faltan.map((l) => `${l.producto} ${l.talla} (${n(l.pendiente - disp(l))})`).join(', ')}.
            {hay > 0 ? ` Hay ${n(hay)} de ${n(pend)} batas para surtir parcial.` : ''}
          </p>
        )
      })()}
      {oc.estado === 'cancelada' && (
        <p className="atr-aviso">Cancelada el {formatDateTime(oc.cancelada_en)}. Motivo: {oc.motivo_cancelacion}</p>
      )}
      {errPdf && <p className="form-error">{errPdf}</p>}

      <div className={'atr-oc-detalle' + (verPdf && pdfUrl ? ' atr-oc-detalle--con-pdf' : '')}>
        <div className="atr-tabla-wrap">
          <table className="simple-table atr-tabla">
            <thead>
              <tr>
                <th>Bata</th><th>Talla</th>
                <th className="atr-num">Pedido</th><th className="atr-num">Entregado</th><th className="atr-num">Apartado</th>
                <th className="atr-num">Pendiente</th><th className="atr-num">Disponible</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.oc_linea_id} className={l.pendiente > 0 && (l.disponible ?? l.existencia) < l.pendiente && oc.estado !== 'cancelada' ? 'atr-oc-fila--falta' : ''}>
                  <td><AtrBata producto={l.producto} color={l.color} conBolsa={l.con_bolsa} />{l.texto_pdf ? <div className="atr-muted atr-oc-pdf-txt">PDF: {l.texto_pdf}</div> : null}</td>
                  <td>{l.talla}</td>
                  <td className="atr-num">{n(l.pedido)}</td>
                  <td className="atr-num">{n(l.entregado ?? l.surtido)}</td>
                  <td className="atr-num">{l.apartado ? <span className="atr-apartado">{n(l.apartado)}</span> : '·'}</td>
                  <td className="atr-num"><strong>{n(l.pendiente)}</strong></td>
                  <td className={'atr-num' + ((l.disponible ?? l.existencia) < 0 ? ' atr-negativo' : '')}>
                    {n(l.disponible ?? l.existencia)}
                    {l.apartado > 0 && <div className="atr-muted atr-oc-pdf-txt">de {n(l.existencia)} en existencia</div>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}><strong>Total</strong></td>
                <td className="atr-num"><strong>{n(oc.pedido)}</strong></td>
                <td className="atr-num"><strong>{n(oc.entregado ?? oc.surtido)}</strong></td>
                <td className="atr-num"><strong>{n(oc.apartado || 0)}</strong></td>
                <td className="atr-num"><strong>{n(pend)}</strong></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {verPdf && pdfUrl && (
          <div className="atr-oc-visor"><iframe title={`PDF OC ${oc.numero_oc}`} src={pdfUrl} /></div>
        )}
      </div>

      <section className="atr-surtidos">
        <h3 className="atr-surtidos__titulo">Surtidos de esta OC</h3>
        <p className="atr-muted atr-oc-meta">Al surtir, las batas quedan <strong>apartadas</strong>; se descuentan del inventario cuando contabilidad confirma la entrega con la factura.</p>
        {aviso && <p className="form-error">{aviso}</p>}
        {okMsg && <p className="atr-ok">{okMsg}</p>}
        {surtidos.length === 0 ? (
          <p className="atr-muted">Todavía no se ha surtido nada.</p>
        ) : (
          <ul className="atr-surtidos__lista">
            {surtidos.map((g) => (
              <li key={g.surtido_id} className={'atr-bloque atr-surtido atr-surtido--' + g.estado}>
                <div className="atr-surtido__cab">
                  <span>
                    <EstadoSurtido g={g} />{' '}
                    <strong>{formatDateTime(g.fecha)}</strong> · {n(g.piezas)} batas · surtió {g.usuario || '—'}
                  </span>
                  <span className="atr-acciones">
                    <button type="button" className="btn btn--ghost btn--small" onClick={() => verHoja(oc, g)}>Hoja de surtido</button>
                    {g.estado !== 'cancelado' && canCargarAtr(role) && oc.estado !== 'cancelada' && (
                      <button type="button" className="btn btn--ghost btn--small atr-btn-peligro" onClick={() => setDeshacer(g)}>Deshacer</button>
                    )}
                  </span>
                </div>
                <div className="atr-surtido__lineas atr-surtido__bt">
                  {g.lineas.map((l, i) => (
                    <span key={i} className="atr-surtido__linea"><AtrBata producto={l.producto} color={l.color} conBolsa={l.con_bolsa} /> {l.talla}: <strong>{n(l.cantidad)}</strong></span>
                  ))}
                </div>
                {g.nota && <div className="atr-muted atr-surtido__lineas">Nota: {g.nota}</div>}
                {g.estado === 'entregado' && g.confirmado && (
                  <div className="atr-muted atr-surtido__lineas">Confirmó {g.confirmado.usuario || '—'} el {formatDateTime(g.confirmado.fecha)}</div>
                )}
                {g.estado === 'apartado' && canFacturarAtr(role) && (
                  <ConfirmarEntrega surtido={g} onListo={(msg) => { setAviso(null); setOkMsg(msg); cargar() }} />
                )}
                {g.deshecho && (
                  <div className="atr-negativo atr-surtido__lineas">
                    Deshecho el {formatDateTime(g.deshecho.fecha)} por {g.deshecho.usuario || '—'}: {g.deshecho.motivo}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {surtir && <AtrSurtirModal oc={oc} lineas={lineas} onClose={() => setSurtir(false)} onListo={surtidoListo} />}
      {hoja && <PdfPreviewModal blob={hoja.blob} fileName={hoja.fileName} onClose={() => setHoja(null)} />}
      {deshacer && (
        <DeshacerSurtido oc={oc} surtido={deshacer} onClose={() => setDeshacer(null)} onListo={() => { setDeshacer(null); cargar() }} />
      )}
      {cancelar && <CancelarOc oc={oc} onClose={() => setCancelar(false)} onListo={() => { setCancelar(false); cargar() }} />}
    </div>
  )
}

function CancelarOc({ oc, onClose, onListo }) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function confirmar() {
    setError(null)
    if (!motivo.trim()) return setError('Escribe por qué se cancela.')
    setGuardando(true)
    const { error: e } = await cancelarAtrOc(oc.id, motivo.trim())
    setGuardando(false)
    if (e) return setError(e.message)
    onListo()
  }

  return (
    <Modal title={`Cancelar OC ${oc.numero_oc}`} onClose={onClose}>
      <p>La OC dejará de contar en "Qué nos falta" y ya no se podrá surtir.</p>
      {oc.surtido > 0 && (
        <div className="atr-aviso">
          <span>
            Esta OC ya tiene <strong>{n(oc.surtido)} batas surtidas</strong>. Cancelarla <strong>no</strong> las regresa al
            inventario. Si se deben regresar, deshaz el surtido antes de cancelar.
          </span>
        </div>
      )}
      <label className="atr-campo"><span className="field-label">Motivo</span>
        <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="atr-pie">
        <button type="button" className="btn btn--ghost" onClick={onClose}>No cancelar</button>
        <button type="button" className="btn btn--primary atr-btn-peligro--lleno" disabled={guardando} onClick={confirmar}>
          {guardando ? 'Cancelando…' : 'Sí, cancelar OC'}
        </button>
      </div>
    </Modal>
  )
}

function DeshacerSurtido({ oc, surtido, onClose, onListo }) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function confirmar() {
    setError(null)
    if (!motivo.trim()) return setError('Escribe por qué se deshace.')
    setGuardando(true)
    const { error: e } = await deshacerSurtidoAtr(surtido.surtido_id, motivo.trim())
    setGuardando(false)
    if (e) return setError(e.message)
    onListo()
  }

  return (
    <Modal title={`Deshacer surtido de la OC ${oc.numero_oc}`} onClose={onClose}>
      <p>
        {surtido.estado === 'apartado' ? (
          <>Las <strong>{n(surtido.piezas)} batas</strong> apartadas en este surtido ({formatDateTime(surtido.fecha)}) se liberan y
          vuelven a quedar pendientes en la OC. Todavía no se habían descontado del inventario.</>
        ) : (
          <>Las <strong>{n(surtido.piezas)} batas</strong> de este surtido ({formatDateTime(surtido.fecha)}) regresan al inventario y
          vuelven a quedar pendientes en la OC. No se borra nada: queda en el historial como movimiento contrario.</>
        )}
      </p>
      <p className="atr-muted">{surtido.lineas.map((l) => `${l.producto} ${l.talla}: ${n(l.cantidad)}`).join(' · ')}</p>
      <label className="atr-campo"><span className="field-label">Motivo</span>
        <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="atr-pie">
        <button type="button" className="btn btn--ghost" onClick={onClose}>No deshacer</button>
        <button type="button" className="btn btn--primary atr-btn-peligro--lleno" disabled={guardando} onClick={confirmar}>
          {guardando ? 'Deshaciendo…' : 'Sí, deshacer surtido'}
        </button>
      </div>
    </Modal>
  )
}

function EstadoSurtido({ g }) {
  if (g.estado === 'apartado') return <span className="frisa-nivel frisa-nivel--amarillo">Apartado · por facturar</span>
  if (g.estado === 'entregado') {
    return <span className="frisa-nivel frisa-nivel--verde">{g.factura ? `Entregado · Factura ${g.factura}` : 'Entregado'}</span>
  }
  return <span className="frisa-nivel frisa-nivel--neutro">Deshecho</span>
}

// V220 — Contabilidad confirma la entrega de un surtido con la factura.
export function ConfirmarEntrega({ surtido, onListo }) {
  const [factura, setFactura] = useState('')
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function confirmar() {
    setError(null)
    if (!factura.trim()) return setError('Escribe el número de factura.')
    setGuardando(true)
    const { error: e } = await confirmarEntregaAtr(surtido.surtido_id, factura.trim())
    setGuardando(false)
    if (e) return setError(e.message)
    onListo(`Se confirmó la entrega con la factura ${factura.trim()}: ${n(surtido.piezas)} batas salieron del inventario.`)
  }

  return (
    <div className="atr-confirmar">
      <input className="input" placeholder="Número de factura" value={factura} onChange={(e) => setFactura(e.target.value)} aria-label="Número de factura" />
      <button type="button" className="btn btn--primary btn--small" disabled={guardando} onClick={confirmar}>
        {guardando ? 'Confirmando…' : 'Confirmar entrega'}
      </button>
      {error && <span className="form-error">{error}</span>}
    </div>
  )
}
