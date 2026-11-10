import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { editarHojaImpresa, fetchHojasImpresas, quitarHojaImpresa } from '../../services/hojasImpresasService'
import { agruparPorParte, marcarOtraPrenda } from '../../utils/imprimirOperaciones'
import { olvidarOpcionesOperaciones } from '../../hooks/usePrendasOperaciones'
import Modal from '../talleros/Modal'
import { coincideNombre } from '../../utils/buscarPorNombre'
import BuscadorNombre from '../common/BuscadorNombre'
import { Loading, ErrorState, EmptyState } from '../common/States'
import { formatDateTime } from '../../utils/dates'
import '../impresion/impresion.css'

// V173 — hojas de operaciones que ya se imprimieron (una por prenda + título).
// Se pueden ver, volver a imprimir y quitar. Ver schema_v173_hojas_impresas.sql.
// V177 — `puedeEditar` + `catalogo` (todas las operaciones): agregar o quitar
// operaciones de la hoja y cambiarle el título.
export default function HojasImpresas({ puedeQuitar, puedeEditar = false, catalogo = [], onMarcar }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [quitando, setQuitando] = useState(null)
  const [editando, setEditando] = useState(null)

  const load = useCallback(async () => {
    const { data, error: err } = await fetchHojasImpresas()
    if (err) return setError(err)
    setError(null)
    setLista(data || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function quitar(h) {
    if (!window.confirm(`¿Quitar la hoja «${h.titulo}» de la lista?`)) return
    setQuitando(h.id)
    const { error: err } = await quitarHojaImpresa(h.id)
    setQuitando(null)
    if (err) return setError(err)
    setLista((prev) => prev.filter((x) => x.id !== h.id))
  }

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!lista) return <Loading label="Cargando hojas impresas…" />
  if (lista.length === 0) {
    return <EmptyState>Todavía no se ha impreso ninguna hoja. Marca las operaciones que lleva la hoja (pueden ser de varias prendas) y toca «Imprimir operaciones»: al ver el PDF se guarda aquí.</EmptyState>
  }

  const visibles = lista.filter((h) => coincideNombre(busqueda, h.titulo, h.prenda))
  return (
    <div className="hojas-impresas">
      <BuscadorNombre value={busqueda} onChange={setBusqueda} placeholder="Buscar por título o prenda…" />
      {busqueda && (
        <p className="template-hint">
          {visibles.length} de {lista.length}
        </p>
      )}
      {visibles.length === 0 && <EmptyState>Ninguna hoja coincide con «{busqueda}».</EmptyState>}
      {visibles.map((h) => {
        const ops = h.operaciones || []
        const abierto = abierta === h.id
        return (
          <section key={h.id} className="card hojas-impresas__item">
            <button type="button" className="hojas-impresas__head" aria-expanded={abierto} onClick={() => setAbierta(abierto ? null : h.id)}>
              <strong>
                {abierto ? '▾' : '▸'} {h.titulo}
              </strong>
              <span className="template-hint">
                {h.prenda} · {ops.length} {ops.length === 1 ? 'operación' : 'operaciones'} · impresa {h.veces} {h.veces === 1 ? 'vez' : 'veces'} · última {formatDateTime(h.ultima_en)}
                {h.ultima_por_nombre ? ` por ${h.ultima_por_nombre}` : ''}
              </span>
            </button>
            {abierto && (
              <>
                <div className="revision__tabla-wrap">
                  <table className="simple-table">
                    <thead>
                      <tr>
                        <th>Folio</th>
                        <th>Operación</th>
                        <th className="hojas-impresas__num">Tiempo (seg)</th>
                      </tr>
                    </thead>
                    {/* Igual que la hoja impresa: agrupada por parte, cada parte en orden de folio. */}
                    {agruparPorParte(marcarOtraPrenda(ops, h.prenda)).map((g) => (
                      <tbody key={g.parte}>
                        <tr>
                          <th colSpan={3} className="hojas-impresas__parte hojas-impresas__parte--hoja">
                            {g.parte}
                          </th>
                        </tr>
                        {g.operaciones.map((o) => (
                          <tr key={o.folio}>
                            <td>{o.folio}</td>
                            <td>{o.operacion}</td>
                            <td className="hojas-impresas__num">{Number(o.segundos).toLocaleString('es-MX', { maximumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    ))}
                  </table>
                </div>
                <div className="hojas-impresas__acciones">
                  <Link to={`/produccion/operaciones/imprimir?hoja=${h.id}`} className="btn btn--secondary btn--small">
                    Volver a imprimir
                  </Link>
                  {onMarcar && (
                    <button type="button" className="btn btn--secondary btn--small" onClick={() => onMarcar(h)}>
                      Marcar estas operaciones
                    </button>
                  )}
                  {puedeEditar && (
                    <button type="button" className="btn btn--secondary btn--small" onClick={() => setEditando(h)}>
                      Editar operaciones
                    </button>
                  )}
                  {puedeQuitar && (
                    <button type="button" className="btn btn--ghost btn--small" disabled={quitando === h.id} onClick={() => quitar(h)}>
                      {quitando === h.id ? 'Quitando…' : 'Quitar de la lista'}
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )
      })}
      {editando && (
        <EditarHoja
          hoja={editando}
          catalogo={catalogo}
          onClose={() => setEditando(null)}
          onDone={(nueva) => {
            setEditando(null)
            olvidarOpcionesOperaciones()
            setLista((prev) => prev.map((x) => (x.id === nueva.id ? { ...x, ...nueva } : x)))
          }}
        />
      )}
    </div>
  )
}

// V177 — escoger qué operaciones de la prenda lleva la hoja. Salen todas las
// activas de la prenda, más las que ya traía la hoja aunque estén inactivas.
// V182 — también se pueden agregar operaciones de otras prendas (ej. una de
// PLAYERA en la hoja de CAMISOLA): se escoge la prenda y salen sus operaciones.
function EditarHoja({ hoja, catalogo, onClose, onDone }) {
  const enHoja = new Set((hoja.operaciones || []).map((o) => o.folio));
  const [titulo, setTitulo] = useState(hoja.titulo);
  const [sel, setSel] = useState(enHoja);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [otras, setOtras] = useState(() => new Set());

  const prendasCatalogo = [...new Set(catalogo.map((o) => o.prenda))]
    .filter((p) => p !== hoja.prenda && !otras.has(p))
    .sort();
  const delCatalogo = catalogo.filter(
    (o) =>
      (o.prenda === hoja.prenda || otras.has(o.prenda) || enHoja.has(o.folio)) &&
      (o.activa || enHoja.has(o.folio)),
  );
  // Si la operación ya no está en el catálogo cargado, se muestra la copia de la hoja.
  const faltantes = (hoja.operaciones || [])
    .filter((o) => !delCatalogo.some((c) => c.folio === o.folio))
    .map((o) => ({ ...o, activa: true }));
  const lista = [...delCatalogo, ...faltantes].sort(
    (a, b) => a.folio - b.folio,
  );
  const grupos = agruparPorParte(marcarOtraPrenda(lista, hoja.prenda));
  const agregadas = [...sel].filter((f) => !enHoja.has(f)).length;
  const quitadas = [...enHoja].filter((f) => !sel.has(f)).length;

  const toggle = (folio) =>
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(folio)) n.delete(folio);
      else n.add(folio);
      return n;
    });

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { data, error: err } = await editarHojaImpresa({
      id: hoja.id,
      titulo: titulo.trim(),
      folios: [...sel],
    });
    setGuardando(false);
    if (err) return setError(err.message);
    onDone(data);
  }

  return (
    <Modal title={`Editar hoja · ${hoja.prenda}`} onClose={onClose}>
      <div className="order-form">
        <label>
          Título de la hoja
          <input
            className="input"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
        </label>
        <p className="template-hint">
          Palomea las operaciones que lleva la hoja. Lleva <b>{sel.size}</b>
          {agregadas > 0 &&
            ` · ${agregadas} ${agregadas === 1 ? "agregada" : "agregadas"}`}
          {quitadas > 0 &&
            ` · ${quitadas} ${quitadas === 1 ? "quitada" : "quitadas"}`}
          . Los cambios no cuentan como impresión.
        </p>
        {prendasCatalogo.length > 0 && (
          <label>
            Agregar operaciones de otra prenda
            <select
              className="input"
              value=""
              onChange={(e) => {
                const p = e.target.value;
                if (p) setOtras((prev) => new Set([...prev, p]));
              }}
            >
              <option value="">Escoge una prenda…</option>
              {prendasCatalogo.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {otras.size > 0 && (
              <span className="template-hint">
                Mostrando también: {[...otras].join(", ")}. Palomea las que lleva la hoja.
              </span>
            )}
          </label>
        )}
        <div className="revision__tabla-wrap hojas-impresas__editar">
          <table className="simple-table">
            <tbody>
              {grupos.map((g) => (
                <Fragment key={g.parte}>
                  <tr>
                    <th colSpan={4} className="hojas-impresas__parte">
                      {g.parte || "Sin parte"}
                    </th>
                  </tr>
                  {g.operaciones.map((o) => (
                    <tr
                      key={o.folio}
                      className={o.activa ? "" : "mt-catalogo__item--off"}
                    >
                      <td className="ops-marca">
                        <label className="ops-marca__area">
                          <input
                            type="checkbox"
                            checked={sel.has(o.folio)}
                            onChange={() => toggle(o.folio)}
                            aria-label={`Incluir ${o.folio}`}
                          />
                        </label>
                      </td>
                      <td>{o.folio}</td>
                      <td>
                        {o.operacion}
                        {!o.activa && " (inactiva)"}
                      </td>
                      <td className="hojas-impresas__num">
                        {Number(o.segundos).toLocaleString("es-MX", {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={guardando || sel.size === 0 || !titulo.trim()}
            onClick={guardar}
          >
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

