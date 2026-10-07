import { useMemo, useState } from 'react'
import Modal from '../talleros/Modal'
import {
  crearModelo,
  clasificarSeccion,
  guardarSeccion,
  guardarTipoPrenda,
  guardarTalla,
  fetchArticulosModelo,
  registrarEntradaModelo,
} from '../../services/inventarioService'
import { normalizar } from '../../utils/inventarioBusqueda'
import { nombreModelo } from '../../utils/inventarioCatalogo'
import { formatTalla } from '../../utils/inventarioTallas'
import { parsearTallas } from '../../utils/inventarioTallasTexto'

// "Nuevo producto" de Inventario en una sola pantalla (reemplaza al asistente
// de 6 pasos de V121, que además solo dejaba elegir entre dos juegos de
// tallas): categoría, tipo de prenda, nombre y las tallas escritas a mano
// ("32, 34, 38", "28-48", "6 a 3XL"). Opcionalmente, cuántas piezas hay de
// cada talla: se crea el producto y se le da entrada en el mismo guardado.
const NUEVO = '__nuevo__'

const ATAJOS = [
  { label: '2 a 14', texto: '2-14' },
  { label: 'XS a 2XL', texto: 'XS-2XL' },
  { label: '6 a 3XL', texto: '6-3XL' },
  { label: '28 a 48', texto: '28-48' },
  { label: 'Sin talla', texto: 'Sin talla' },
]

export default function NuevoProductoModal({
  secciones,
  clasificaciones,
  tipos,
  tallas,
  modelos,
  ubicaciones,
  motivos,
  seccionInicialId,
  defaultUbicacionId,
  canMover,
  refreshCatalogos,
  refreshEstructura,
  onClose,
  onDone,
  onUsarExistente,
}) {
  const seccionesActivas = useMemo(
    () => secciones.filter((s) => s.activa).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [secciones]
  )
  const tiposActivos = useMemo(() => tipos.filter((t) => t.activo), [tipos])
  const clasificacionesActivas = useMemo(() => clasificaciones.filter((c) => c.activa), [clasificaciones])

  const [seccionId, setSeccionId] = useState(seccionInicialId || '')
  const [seccionNueva, setSeccionNueva] = useState('')
  const [clasificacionId, setClasificacionId] = useState('')
  const [tipoId, setTipoId] = useState('')
  const [tipoNuevo, setTipoNuevo] = useState('')
  const [variante, setVariante] = useState('')
  const [textoTallas, setTextoTallas] = useState('')
  const [cantidades, setCantidades] = useState({}) // nombre de talla → texto
  const [ubicacionId, setUbicacionId] = useState(defaultUbicacionId || ubicaciones[0]?.id || '')
  const [motivoId, setMotivoId] = useState(() => (motivos.find((m) => m.nombre === 'Entrada de producción') || motivos[0])?.id || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const seccion = seccionesActivas.find((s) => s.id === seccionId)
  const tipo = tiposActivos.find((t) => t.id === tipoId)
  const seccionNombre = seccionId === NUEVO ? seccionNueva.trim() : seccion?.nombre
  const tipoNombre = tipoId === NUEVO ? tipoNuevo.trim() : tipo?.nombre
  const varianteLimpia = variante.trim().replace(/\s+/g, ' ')
  const nombre = nombreModelo({ tipo: tipoNombre, seccion: seccionNombre, variante: varianteLimpia })

  const { tallas: elegidas, errores: erroresTallas } = useMemo(() => parsearTallas(textoTallas, tallas), [textoTallas, tallas])
  const tallasNuevas = elegidas.filter((t) => t.nueva)

  const variantesUsadas = useMemo(
    () => [...new Set(modelos.map((m) => m.variante).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [modelos]
  )
  const modeloExistente = useMemo(
    () =>
      seccion && tipo
        ? modelos.find((m) => m.seccionId === seccionId && m.tipoId === tipoId && normalizar(m.variante) === normalizar(varianteLimpia)) || null
        : null,
    [modelos, seccion, tipo, seccionId, tipoId, varianteLimpia]
  )

  const lineasCantidad = elegidas
    .map((t) => ({ talla: t.nombre, cantidad: Number(cantidades[t.nombre]) }))
    .filter((l) => Number.isInteger(l.cantidad) && l.cantidad > 0)
  const totalPiezas = lineasCantidad.reduce((sum, l) => sum + l.cantidad, 0)

  function agregarTexto(texto) {
    setTextoTallas((cur) => (cur.trim() ? `${cur.trim().replace(/,$/, '')}, ${texto}` : texto))
  }

  const listo =
    seccionNombre &&
    (seccionId !== NUEVO || clasificacionId) &&
    tipoNombre &&
    elegidas.length > 0 &&
    erroresTallas.length === 0 &&
    !modeloExistente &&
    (lineasCantidad.length === 0 || (ubicacionId && motivoId))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!listo) return
    setSaving(true)
    setError(null)
    const fallar = (err) => {
      setSaving(false)
      setError(err)
    }

    let seccionFinal = seccionId
    if (seccionId === NUEVO) {
      const { data, error: err } = await guardarSeccion({ id: null, nombre: seccionNombre, activa: true, orden: 50 })
      if (err) return fallar(err)
      const { error: err2 } = await clasificarSeccion({ seccionId: data.id, clasificacionId, clienteId: null })
      await refreshCatalogos()
      if (err2) return fallar(err2)
      seccionFinal = data.id
      setSeccionId(data.id)
    }

    let tipoFinal = tipoId
    if (tipoId === NUEVO) {
      const { data, error: err } = await guardarTipoPrenda({ id: null, nombre: tipoNombre, activo: true, orden: 50 })
      if (err) return fallar(err)
      await refreshEstructura()
      tipoFinal = data.id
      setTipoId(data.id)
    }

    const idPorTalla = new Map(elegidas.filter((t) => !t.nueva).map((t) => [t.nombre, t.id]))
    for (const t of tallasNuevas) {
      const { data, error: err } = await guardarTalla({ id: null, nombre: t.nombre, orden: t.orden })
      if (err) return fallar(new Error(`No pude crear la talla ${t.nombre}: ${err.message}`))
      idPorTalla.set(t.nombre, data.id)
    }
    if (tallasNuevas.length > 0) await refreshEstructura()

    const { data: creado, error: errModelo } = await crearModelo({
      seccionId: seccionFinal,
      tipoPrendaId: tipoFinal,
      variante: varianteLimpia,
      juegoTallasId: null,
      tallaIds: elegidas.map((t) => idPorTalla.get(t.nombre)),
    })
    if (errModelo) return fallar(errModelo)
    if (creado?.ya_existia) return fallar(new Error('Ya existe un producto con esa categoría, tipo y nombre. No se creó nada.'))

    if (lineasCantidad.length > 0) {
      const { data: arts, error: errArts } = await fetchArticulosModelo(creado.modelo_id)
      const tallaIdDe = (n) => idPorTalla.get(n)
      const lineas = lineasCantidad.map((l) => ({ articuloId: (arts || []).find((a) => a.talla_id === tallaIdDe(l.talla))?.id, cantidad: l.cantidad }))
      const errEntrada =
        errArts || lineas.some((l) => !l.articuloId)
          ? errArts || new Error('no encontré sus tallas')
          : (await registrarEntradaModelo({ modeloId: creado.modelo_id, ubicacionId, motivoId, nota: 'Alta del producto', lineas })).error
      if (errEntrada) {
        // El producto ya existe; solo faltó la entrada. Se avisa y se cierra hacia él.
        window.alert(`El producto se creó, pero no se pudieron registrar las piezas (${errEntrada.message}). Dale entrada desde "Dar entrada".`)
      }
    }

    setSaving(false)
    onDone({ modeloId: creado.modelo_id, seccionId: seccionFinal })
  }

  return (
    <Modal title="Nuevo producto" onClose={onClose}>
      <form className="order-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Categoría *
            <select className="input" value={seccionId} onChange={(e) => setSeccionId(e.target.value)} autoFocus={!seccionId}>
              <option value="">Elige…</option>
              {seccionesActivas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
              <option value={NUEVO}>+ Nueva categoría…</option>
            </select>
          </label>
          <label>
            Tipo de prenda *
            <select className="input" value={tipoId} onChange={(e) => setTipoId(e.target.value)} autoFocus={!!seccionId}>
              <option value="">Elige…</option>
              {tiposActivos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
              <option value={NUEVO}>+ Otro tipo…</option>
            </select>
          </label>
        </div>

        {seccionId === NUEVO && (
          <div className="form-row">
            <label>
              Nombre de la categoría *
              <input type="text" className="input" value={seccionNueva} onChange={(e) => setSeccionNueva(e.target.value)} placeholder="Ej. Colegio Nexus" />
            </label>
            <label>
              ¿Qué es? *
              <select className="input" value={clasificacionId} onChange={(e) => setClasificacionId(e.target.value)}>
                <option value="">Elige…</option>
                {clasificacionesActivas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {tipoId === NUEVO && (
          <label>
            Nombre del tipo de prenda *
            <input type="text" className="input" value={tipoNuevo} onChange={(e) => setTipoNuevo(e.target.value)} placeholder="Ej. Mandil" />
          </label>
        )}

        <label>
          Nombre o variante <span className="pantone-hint">(opcional: color, modelo, generación…)</span>
          <input
            type="text"
            className="input"
            list="inv-variantes-usadas"
            value={variante}
            onChange={(e) => setVariante(e.target.value)}
            placeholder="Ej. de Vigilancia, Azul Marino, Gen 2031"
          />
          <datalist id="inv-variantes-usadas">
            {variantesUsadas.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>

        {nombre && (
          <p className="pantone-hint">
            Se va a llamar: <strong>{nombre}</strong>
          </p>
        )}
        {modeloExistente && (
          <p className="form-error">
            Ya existe este producto.{' '}
            <button type="button" className="btn btn--ghost btn--small" onClick={() => onUsarExistente(modeloExistente)}>
              Abrirlo
            </button>
          </p>
        )}

        <div className="inv-field">
          <span>Tallas * — escríbelas separadas por coma, o un rango con guion</span>
          <input
            type="text"
            className="input"
            value={textoTallas}
            onChange={(e) => setTextoTallas(e.target.value)}
            placeholder="Ej. 32, 34, 38   ·   28-48   ·   6-3XL"
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ATAJOS.map((a) => (
              <button key={a.label} type="button" className="btn btn--ghost btn--small" onClick={() => agregarTexto(a.texto)}>
                + {a.label}
              </button>
            ))}
          </div>
          {erroresTallas.map((msg) => (
            <p key={msg} className="form-error">
              {msg}
            </p>
          ))}
          {tallasNuevas.length > 0 && (
            <p className="pantone-hint">
              {tallasNuevas.length === 1 ? 'La talla' : 'Las tallas'} {tallasNuevas.map((t) => t.nombre).join(', ')} no{' '}
              {tallasNuevas.length === 1 ? 'existía' : 'existían'} en el catálogo de tallas: se {tallasNuevas.length === 1 ? 'crea' : 'crean'} al guardar.
            </p>
          )}
        </div>

        {elegidas.length > 0 && (
          <div className="inv-field">
            <span>
              {elegidas.length} {elegidas.length === 1 ? 'talla' : 'tallas'}
              {canMover ? ' — si ya tienes piezas, escribe cuántas hay de cada una (opcional)' : ''}
            </span>
            <div className="inv-grid">
              {elegidas.map((t) => (
                <div key={t.nombre} className="inv-grid__celda">
                  <span className="inv-grid__talla">{formatTalla(t.nombre)}</span>
                  {canMover && (
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      className="input input--small"
                      aria-label={`Piezas talla ${t.nombre}`}
                      placeholder="0"
                      value={cantidades[t.nombre] ?? ''}
                      onChange={(e) => setCantidades((cur) => ({ ...cur, [t.nombre]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {lineasCantidad.length > 0 && (
          <div className="form-row">
            <label>
              ¿Dónde están las piezas?
              <select className="input" value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Motivo de la entrada
              <select className="input" value={motivoId} onChange={(e) => setMotivoId(e.target.value)}>
                {motivos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {error && <p className="form-error">{error.message}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || !listo}>
            {saving
              ? 'Guardando…'
              : totalPiezas > 0
                ? `Crear producto y dar entrada a ${totalPiezas} ${totalPiezas === 1 ? 'pieza' : 'piezas'}`
                : 'Crear producto'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
