import { useEffect, useMemo, useState } from 'react'
import { fetchInventarioTelas, fetchMovimientosPorOrden, marcarCorte } from '../../services/movimientosTelaService'

// Registro del corte (tela usada por trazo). Lo usan la pantalla de corte
// (EstacionOrderPage) y, para registrar después un corte que se marcó sin
// tela, el detalle de la orden de los administradores de fábrica
// (OrderCorteResumen).

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
const nuevoCorte = (telaId, extra = false, hojas = '', libre = false) => ({ key: ++cortePk, telaId, extra, libre, descripcion: '', largo: '', piezas: '', hojas })

//
// V153 — una orden SIN tela en sus prendas ya no se queda sin registro: corte
// elige la tela en el mismo formulario (corte "libre"). Y con `despues`, el
// formulario sirve para registrar el corte de una orden que ya se marcó
// cortada sin registrar tela (el servidor no deja registrarlo dos veces).
export function TelaUsadaCorte({ order, unaHoja = false, onCortado, onCortadoSinTela, despues = false }) {
  const telaIds = useMemo(() => [...new Set((order.items || []).map((i) => i.tela_id).filter(Boolean))], [order.items])
  const sinTela = telaIds.length === 0
  const [telas, setTelas] = useState({})
  const hojasInicial = unaHoja ? '1' : ''
  const [cortes, setCortes] = useState(() =>
    sinTela ? [nuevoCorte('', false, hojasInicial, true)] : telaIds.map((id) => nuevoCorte(id, false, hojasInicial))
  )
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
  const completo = (c) => metrosDe(c) != null && piezasDe(c) != null && !!c.telaId && (!c.extra || c.descripcion.trim() !== '')

  // Cada tela de la orden necesita al menos un corte completo; los cortes
  // agregados tienen que estar completos (o quitarse).
  // Sin tela en la orden: basta un corte completo con su tela elegida.
  const todasCapturadas = sinTela
    ? cortes.length > 0 && cortes.every(completo)
    : telaIds.every((id) => cortes.some((c) => !c.extra && c.telaId === id && completo(c))) && cortes.filter((c) => c.extra).every(completo)

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
      {sinTela && (
        <p className="pantone-hint">
          {despues ? 'Esta orden se marcó cortada sin registrar la tela. ' : ''}
          Las prendas de esta orden no tienen tela asignada: elige aquí la tela que usaste.
        </p>
      )}
      {cortes.map((c, i) => {
        const unidad = unidadTela(c.telaId)
        const metros = metrosDe(c)
        const piezas = piezasDe(c)
        return (
          <div key={c.key} className="estacion-trazo">
            <p className="field-label">
              {c.extra ? `Corte ${i + 1}` : c.libre ? 'Tela usada' : nombreTela(c.telaId)} {!c.extra && !c.libre && unidad ? `(${unidad})` : ''}
            </p>
            {c.libre && (
              <label>
                Tela *
                <select className="input" value={c.telaId} onChange={(e) => actualizar(c.key, { telaId: e.target.value })}>
                  <option value="">Elige la tela…</option>
                  {Object.keys(telas).map((id) => (
                    <option key={id} value={id}>
                      {nombreTela(id)}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
                    {!c.telaId && <option value="">Elige la tela…</option>}
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
            {(c.extra || (c.libre && cortes.length > 1)) && (
              <button type="button" className="btn btn--ghost btn--small" onClick={() => quitar(c.key)}>
                Quitar este corte
              </button>
            )}
          </div>
        )
      })}
      <button type="button" className="btn btn--secondary estacion-btn" onClick={() => setCortes((prev) => [...prev, nuevoCorte(telaIds[0] || '', true, hojasInicial)])}>
        + Agregar otro corte
      </button>
      {error && <p className="form-error">{error.message}</p>}
      {!confirmando ? (
        <>
          <button type="button" className="btn btn--primary estacion-btn" disabled={!todasCapturadas} onClick={() => setConfirmando(true)}>
            {despues ? 'Registrar corte' : 'Cortado'}
          </button>
          {sinTela && !despues && onCortadoSinTela && (
            // Último recurso (p. ej. tela que no está en el catálogo): se puede
            // registrar después desde esta misma pantalla.
            <button type="button" className="btn btn--ghost btn--small" onClick={onCortadoSinTela}>
              Marcar cortada sin registrar la tela
            </button>
          )}
        </>
      ) : (
        <div className="estacion-acciones">
          <p>
            ¿Confirmas que se usaron {telasUsadas.map((id) => `${cantidadTxt(id, totalDeTela(id))} de ${nombreTela(id)}`).join(', ')}
            {despues ? ' en el corte de esta orden?' : ' y la orden está cortada?'}
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

// V153 — corte ya marcado. Si se marcó sin registrar la tela (orden sin tela
// en sus prendas, o "Cortado" de antes de V153), se puede registrar ahora.
export function CorteTerminado({ order, unaHoja, onRegistrado }) {
  const [registrado, setRegistrado] = useState(null)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    fetchMovimientosPorOrden(order.id).then(({ data, error }) => {
      // Si no se pudo leer, mejor no ofrecer registrar (evita duplicar).
      setRegistrado(error ? true : (data || []).some((m) => m.tipo === 'consumo_corte'))
    })
  }, [order.id])

  if (registrado !== false) {
    return (
      <button type="button" className="btn btn--primary estacion-btn" disabled>
        Cortado
      </button>
    )
  }
  if (!abierto) {
    return (
      <div className="estacion-consumo">
        <p className="pantone-hint">Esta orden se marcó cortada sin registrar la tela usada.</p>
        <button type="button" className="btn btn--secondary estacion-btn" onClick={() => setAbierto(true)}>
          Registrar el corte
        </button>
      </div>
    )
  }
  return (
    <TelaUsadaCorte
      order={order}
      unaHoja={unaHoja}
      despues
      onCortado={() => {
        setRegistrado(true)
        onRegistrado?.()
      }}
    />
  )
}
