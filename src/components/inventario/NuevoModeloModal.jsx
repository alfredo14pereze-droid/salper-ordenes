import { useEffect, useMemo, useState } from 'react'
import Modal from '../talleros/Modal'
import {
  crearModelo,
  clasificarSeccion,
  guardarSeccion,
  guardarTipoPrenda,
} from '../../services/inventarioService'
import { fetchClientes } from '../../services/clientesService'
import { normalizar, palabras } from '../../utils/inventarioBusqueda'
import { nombreModelo } from '../../utils/inventarioCatalogo'
import { formatTalla } from '../../utils/inventarioTallas'

// V121 — asistente "Nuevo modelo". El nombre del artículo ya no se
// escribe a mano: se arma con campos obligatorios, paso a paso:
//   1 Clasificación → 2 Cliente o línea → 3 Tipo de prenda →
//   4 Variante (opcional) → 5 Juego de tallas → 6 Vista previa.
// Al confirmar, inv_crear_modelo crea todas las tallas con existencia 0.
// Antes de llegar a las tallas revisa si ya existe un modelo con la misma
// combinación y lo avisa (el servidor lo vuelve a validar de todos modos).
const PASOS = ['Clasificación', 'Cliente o línea', 'Tipo de prenda', 'Variante', 'Tallas', 'Vista previa']

// Coincidencia simple para las listas del asistente: cada palabra escrita
// debe ser inicio de alguna palabra del nombre.
function coincide(nombre, q) {
  const tokens = palabras(q)
  if (tokens.length === 0) return true
  const ws = palabras(nombre)
  return tokens.every((t) => ws.some((w) => w.startsWith(t)))
}

export default function NuevoModeloModal({
  secciones,
  clasificaciones,
  tipos,
  juegos,
  tallas,
  modelos,
  articulos,
  refreshCatalogos,
  refreshEstructura,
  onClose,
  onDone,
  onUsarExistente,
}) {
  const [paso, setPaso] = useState(0)
  const [clasificacionId, setClasificacionId] = useState('')
  const [seccionId, setSeccionId] = useState('')
  const [tipoId, setTipoId] = useState('')
  const [variante, setVariante] = useState('')
  const [juegoId, setJuegoId] = useState('')
  const [tallasFuera, setTallasFuera] = useState(() => new Set()) // tallas del juego que este modelo NO maneja
  const [q, setQ] = useState('')
  const [nuevoNombre, setNuevoNombre] = useState(null) // null = cerrado; texto = alta en línea abierta
  const [clientes, setClientes] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchClientes().then(({ data }) => setClientes(data || []))
  }, [])

  const tallaMap = useMemo(() => new Map(tallas.map((t) => [t.id, t])), [tallas])
  const clasificacion = clasificaciones.find((c) => c.id === clasificacionId)
  const seccion = secciones.find((s) => s.id === seccionId)
  const tipo = tipos.find((t) => t.id === tipoId)
  const juego = juegos.find((j) => j.id === juegoId)
  const varianteLimpia = variante.trim().replace(/\s+/g, ' ')

  // Paso 2: los de esta clasificación, más los que todavía no tienen
  // ninguna (elegir uno de esos se la asigna al confirmar).
  const seccionesPaso = useMemo(
    () =>
      secciones
        .filter((s) => s.activa && (s.clasificacion_id === clasificacionId || !s.clasificacion_id))
        .filter((s) => coincide(s.nombre, q))
        .sort((a, b) => Number(!a.clasificacion_id) - Number(!b.clasificacion_id) || a.nombre.localeCompare(b.nombre, 'es')),
    [secciones, clasificacionId, q]
  )
  const tiposPaso = useMemo(() => tipos.filter((t) => t.activo && coincide(t.nombre, q)), [tipos, q])

  // Alta en línea de cliente/línea: sugiere clientes del catálogo de
  // Órdenes que todavía no están ligados a Inventario, para no duplicar.
  const clientesSugeridos = useMemo(() => {
    if (nuevoNombre === null || paso !== 1 || !nuevoNombre.trim()) return []
    const ligados = new Set(secciones.map((s) => s.cliente_id).filter(Boolean))
    return clientes.filter((c) => !ligados.has(c.id) && coincide(c.nombre, nuevoNombre)).slice(0, 6)
  }, [clientes, secciones, nuevoNombre, paso])

  const variantesUsadas = useMemo(
    () => [...new Set(modelos.map((m) => m.variante).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [modelos]
  )

  const modeloExistente = useMemo(
    () =>
      modelos.find(
        (m) => m.seccionId === seccionId && m.tipoId === tipoId && normalizar(m.variante) === normalizar(varianteLimpia)
      ) || null,
    [modelos, seccionId, tipoId, varianteLimpia]
  )

  const tallasElegidas = useMemo(
    () => (juego ? juego.tallaIds.filter((id) => !tallasFuera.has(id) && tallaMap.has(id)) : []),
    [juego, tallasFuera, tallaMap]
  )

  const nombreBase = nombreModelo({ tipo: tipo?.nombre, seccion: seccion?.nombre, variante: varianteLimpia })

  // Vista previa: un artículo suelto que ya existe con la misma prenda no
  // se duplica, se vincula al modelo (ver inv_crear_modelo) — los de las
  // tallas elegidas y también los de otras tallas (`extras`).
  const { preview, extras } = useMemo(() => {
    const prenda = normalizar([tipo?.nombre, varianteLimpia].filter(Boolean).join(' '))
    const sueltos = articulos.filter((a) => a.seccionId === seccionId && !a.modeloId && normalizar(a.prenda) === prenda)
    const elegidas = new Set(tallasElegidas)
    return {
      preview: tallasElegidas.map((id) => ({
        id,
        nombre: `${nombreBase} ${formatTalla(tallaMap.get(id).nombre)}`,
        existente: sueltos.find((a) => a.tallaId === id),
      })),
      extras: sueltos.filter((a) => !elegidas.has(a.tallaId)).sort((x, y) => x.tallaOrden - y.tallaOrden),
    }
  }, [tallasElegidas, tallaMap, articulos, seccionId, tipo, varianteLimpia, nombreBase])

  function irA(n) {
    setError(null)
    setQ('')
    setNuevoNombre(null)
    setPaso(n)
  }

  async function crearSeccionEnLinea(nombre, clienteId = null) {
    setSaving(true)
    setError(null)
    const { data, error: err } = await guardarSeccion({ id: null, nombre, activa: true, orden: 50 })
    if (err) {
      setSaving(false)
      return setError(err)
    }
    const { error: err2 } = await clasificarSeccion({ seccionId: data.id, clasificacionId, clienteId })
    await refreshCatalogos()
    setSaving(false)
    if (err2) return setError(err2)
    setSeccionId(data.id)
    irA(2)
  }

  async function crearTipoEnLinea(nombre) {
    setSaving(true)
    setError(null)
    const { data, error: err } = await guardarTipoPrenda({ id: null, nombre, activo: true, orden: 50 })
    if (err) {
      setSaving(false)
      return setError(err)
    }
    await refreshEstructura()
    setSaving(false)
    setTipoId(data.id)
    irA(3)
  }

  async function handleConfirmar() {
    setSaving(true)
    setError(null)
    if (seccion && seccion.clasificacion_id !== clasificacionId) {
      const { error: errSec } = await clasificarSeccion({ seccionId, clasificacionId, clienteId: seccion.cliente_id })
      if (errSec) {
        setSaving(false)
        return setError(errSec)
      }
    }
    const { data, error: err } = await crearModelo({
      seccionId,
      tipoPrendaId: tipoId,
      variante: varianteLimpia,
      juegoTallasId: juegoId,
      tallaIds: tallasElegidas,
    })
    setSaving(false)
    if (err) return setError(err)
    if (data?.ya_existia) {
      return setError(new Error('Ya existe este modelo. No se creó nada: regresa al paso de Variante para usarlo o cambiarla.'))
    }
    onDone({ modeloId: data.modelo_id, seccionId })
  }

  const puedeSeguir =
    (paso === 0 && clasificacionId) ||
    (paso === 1 && seccionId) ||
    (paso === 2 && tipoId) ||
    (paso === 3 && !modeloExistente) ||
    (paso === 4 && tallasElegidas.length > 0)

  return (
    <Modal title="Nuevo modelo" onClose={onClose}>
      <div className="order-form">
        <div className="inv-pasos">
          <span className="inv-pasos__n">
            Paso {paso + 1} de {PASOS.length} · {PASOS[paso]}
          </span>
          {nombreBase && <span className="inv-pasos__nombre">{nombreBase}</span>}
        </div>

        {paso === 0 && (
          <div className="inv-opciones">
            {clasificaciones.filter((c) => c.activa).map((c) => (
              <button
                key={c.id}
                type="button"
                className={'inv-opcion' + (c.id === clasificacionId ? ' inv-opcion--on' : '')}
                onClick={() => {
                  if (c.id !== clasificacionId) setSeccionId('')
                  setClasificacionId(c.id)
                  irA(1)
                }}
              >
                {c.nombre}
              </button>
            ))}
          </div>
        )}

        {paso === 1 && nuevoNombre === null && (
          <>
            <input
              type="search"
              className="input"
              placeholder={`Busca en ${clasificacion?.nombre || 'la lista'}…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            <div className="inv-opciones inv-opciones--lista">
              {seccionesPaso.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={'inv-opcion' + (s.id === seccionId ? ' inv-opcion--on' : '')}
                  onClick={() => {
                    setSeccionId(s.id)
                    irA(2)
                  }}
                >
                  {s.nombre}
                  {!s.clasificacion_id && <span className="inv-opcion__nota">sin clasificación todavía</span>}
                </button>
              ))}
              <button type="button" className="inv-opcion inv-opcion--nuevo" onClick={() => setNuevoNombre(q)}>
                + Nuevo{q.trim() ? ` “${q.trim()}”` : ''}
              </button>
            </div>
            <p className="pantone-hint">
              Los marcados “sin clasificación todavía” ya existen en Inventario; si eliges uno, queda como{' '}
              {clasificacion?.nombre}.
            </p>
          </>
        )}

        {paso === 1 && nuevoNombre !== null && (
          <>
            <label>
              Nombre del nuevo cliente o línea ({clasificacion?.nombre})
              <input
                type="text"
                className="input"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                autoFocus
              />
            </label>
            {clientesSugeridos.length > 0 && (
              <div className="inv-field">
                <span>¿Es uno de estos clientes que ya existen en Órdenes? Elígelo para no duplicarlo:</span>
                <div className="inv-opciones inv-opciones--lista">
                  {clientesSugeridos.map((c) => (
                    <button key={c.id} type="button" className="inv-opcion" disabled={saving} onClick={() => crearSeccionEnLinea(c.nombre, c.id)}>
                      {c.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="order-form__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setNuevoNombre(null)} disabled={saving}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={saving || !nuevoNombre.trim()}
                onClick={() => crearSeccionEnLinea(nuevoNombre.trim())}
              >
                {saving ? 'Guardando…' : 'Crear como nuevo'}
              </button>
            </div>
          </>
        )}

        {paso === 2 && nuevoNombre === null && (
          <>
            <input
              type="search"
              className="input"
              placeholder="Busca el tipo de prenda…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            <div className="inv-opciones inv-opciones--lista">
              {tiposPaso.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={'inv-opcion' + (t.id === tipoId ? ' inv-opcion--on' : '')}
                  onClick={() => {
                    setTipoId(t.id)
                    irA(3)
                  }}
                >
                  {t.nombre}
                </button>
              ))}
              <button type="button" className="inv-opcion inv-opcion--nuevo" onClick={() => setNuevoNombre(q)}>
                + Nuevo{q.trim() ? ` “${q.trim()}”` : ''}
              </button>
            </div>
          </>
        )}

        {paso === 2 && nuevoNombre !== null && (
          <>
            <label>
              Nombre del nuevo tipo de prenda
              <input type="text" className="input" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} autoFocus />
            </label>
            <div className="order-form__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setNuevoNombre(null)} disabled={saving}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={saving || !nuevoNombre.trim()}
                onClick={() => crearTipoEnLinea(nuevoNombre.trim())}
              >
                {saving ? 'Guardando…' : 'Crear tipo'}
              </button>
            </div>
          </>
        )}

        {paso === 3 && (
          <>
            <label>
              Variante (opcional) — color, género, manga, generación…
              <input
                type="text"
                className="input"
                list="inv-variantes"
                placeholder="Ej. Blanca, Niña, Manga larga. Déjalo vacío si no aplica."
                value={variante}
                onChange={(e) => setVariante(e.target.value)}
                autoFocus
              />
              <datalist id="inv-variantes">
                {variantesUsadas.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>
            {modeloExistente && (
              <div className="inv-aviso">
                <p>
                  <b>Ya existe este modelo</b> ({modeloExistente.nombre}, {modeloExistente.articulos.length} tallas). ¿Quieres
                  usarlo?
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn--primary btn--small" onClick={() => onUsarExistente(modeloExistente)}>
                    Usar el que ya existe
                  </button>
                  <span className="pantone-hint" style={{ alignSelf: 'center' }}>
                    o cambia la variante para crear uno distinto.
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {paso === 4 && (
          <>
            <label>
              Juego de tallas
              <select
                className="input"
                value={juegoId}
                onChange={(e) => {
                  setJuegoId(e.target.value)
                  setTallasFuera(new Set())
                }}
              >
                <option value="">Elige un juego…</option>
                {juegos.filter((j) => j.activo).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nombre}
                  </option>
                ))}
              </select>
            </label>
            {juego && (
              <div className="inv-field">
                <span>Quita las tallas que este modelo no maneja</span>
                <div className="inv-checks">
                  {juego.tallaIds.filter((id) => tallaMap.has(id)).map((id) => (
                    <label key={id} className="inv-check">
                      <input
                        type="checkbox"
                        checked={!tallasFuera.has(id)}
                        onChange={() =>
                          setTallasFuera((cur) => {
                            const next = new Set(cur)
                            if (next.has(id)) next.delete(id)
                            else next.add(id)
                            return next
                          })
                        }
                      />
                      {formatTalla(tallaMap.get(id).nombre)}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <p className="pantone-hint">Los juegos de tallas se administran en Inventario → Administración → Tallas y juegos.</p>
          </>
        )}

        {paso === 5 && (
          <div className="inv-field">
            <span>
              Estos son los {preview.length} artículos del modelo; los nuevos se crean con existencia 0 en {seccion?.nombre} ({clasificacion?.nombre}):
            </span>
            <ul className="inv-preview">
              {preview.map((p) => (
                <li key={p.id}>
                  <span>{p.nombre}</span>
                  <span className="inv-preview__nota">{p.existente ? `ya existe (hay ${p.existente.total}), se vincula` : '0'}</span>
                </li>
              ))}
            </ul>
            {extras.length > 0 && (
              <p className="pantone-hint">
                Además ya existen con este mismo nombre, y se vinculan al modelo sin cambiar su existencia:{' '}
                {extras.map((a) => `${formatTalla(a.talla)} (hay ${a.total})`).join(', ')}.
              </p>
            )}
          </div>
        )}

        {error && <p className="form-error">{error.message}</p>}

        {nuevoNombre === null && (
          <div className="order-form__actions">
            {paso > 0 && (
              <button type="button" className="btn btn--ghost" onClick={() => irA(paso - 1)} disabled={saving}>
                ← Atrás
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            {paso < 5 ? (
              <button key="siguiente" type="button" className="btn btn--primary" onClick={() => irA(paso + 1)} disabled={!puedeSeguir}>
                Siguiente →
              </button>
            ) : (
              <button key="confirmar" type="button" className="btn btn--primary" onClick={handleConfirmar} disabled={saving || preview.length === 0}>
                {saving ? 'Creando…' : `Confirmar y crear ${preview.length} artículos`}
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
