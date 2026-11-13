import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canImportarCrm, canUsarCrm } from '../utils/permissions'
import { cambiarEstatus, fetchCrmLista } from '../services/crmService'
import { CRM_ESTATUS, CRM_SEGMENTOS, normTexto } from '../utils/crm'
import { calcularStats, mesesConActividad } from '../utils/crmStats'
import { hoyLocal } from '../utils/tareas'
import { formatDate } from '../utils/dates'
import { EstatusBadge, useCrmUsuarios } from '../components/crm/CrmComunes'
import NuevoProspectoModal from '../components/crm/NuevoProspectoModal'
import EstatusModal from '../components/crm/EstatusModal'
import CrmTablero from '../components/crm/CrmTablero'
import { CrmEstadisticas, CrmKpis, nombreMes } from '../components/crm/CrmEstadisticas'
import '../components/crm/crm.css'

const VISTAS = [
  { key: 'tablero', label: 'Tablero' },
  { key: 'lista', label: 'Lista' },
  { key: 'estadisticas', label: 'Estadísticas' },
]

function vistaGuardada() {
  try {
    const v = localStorage.getItem('crm.vista')
    return VISTAS.some((x) => x.key === v) ? v : 'tablero'
  } catch {
    return 'tablero'
  }
}

// V207 — CRM de prospectos: cifras, tablero por estatus, lista y estadísticas.
export default function CrmPage() {
  return (
    <RequireRole allow={canUsarCrm}>
      <Crm />
    </RequireRole>
  )
}

function Crm() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const usuarios = useCrmUsuarios()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [nuevo, setNuevo] = useState(false)
  const [vista, setVistaState] = useState(vistaGuardada)
  const [busca, setBusca] = useState('')
  const [fEstatus, setFEstatus] = useState('')
  const [fSegmento, setFSegmento] = useState('')
  const [fResp, setFResp] = useState('')
  const [mes, setMes] = useState('')
  const [mover, setMover] = useState(null) // { empresa, estatus } que pide motivo o fecha

  const setVista = (v) => {
    setVistaState(v)
    try {
      localStorage.setItem('crm.vista', v)
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  }

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error: err } = await fetchCrmLista()
    if (err) setError(err)
    else setDatos(data)
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])

  const filas = useMemo(() => {
    if (!datos) return []
    const contactosPor = new Map()
    for (const c of datos.contactos) {
      if (!contactosPor.has(c.empresa_id)) contactosPor.set(c.empresa_id, [])
      contactosPor.get(c.empresa_id).push(c)
    }
    const proximo = new Map()
    for (const s of datos.seguimientos) if (!proximo.has(s.empresa_id)) proximo.set(s.empresa_id, s) // ya vienen por fecha
    return datos.empresas.map((e) => {
      const cs = contactosPor.get(e.id) || []
      const principal = cs.find((c) => c.es_principal) || cs[0] || null
      const texto = normTexto([e.nombre, e.ubicacion, ...cs.flatMap((c) => [c.nombre, c.correo, c.telefono])].filter(Boolean).join(' '))
      return { e, principal, proximo: proximo.get(e.id) || null, texto }
    })
  }, [datos])

  // Búsqueda, segmento y responsable aplican a todo; el estatus solo a la lista
  // (en el tablero cada estatus ya es una columna).
  const visibles = useMemo(() => {
    const q = normTexto(busca)
    return filas.filter(
      (f) =>
        (vista !== 'lista' || !fEstatus || f.e.estatus === fEstatus) &&
        (!fSegmento || f.e.segmento === fSegmento) &&
        (!fResp || (fResp === 'sin' ? !f.e.responsable_id : f.e.responsable_id === fResp)) &&
        (!q || f.texto.includes(q)),
    )
  }, [filas, busca, fEstatus, fSegmento, fResp, vista])

  const hoy = hoyLocal()
  const meses = useMemo(() => (datos ? mesesConActividad(datos.actividades) : []), [datos])
  const st = useMemo(() => {
    if (!datos) return null
    // Mismos filtros que la vista, menos el de estatus (si no, la tasa de cierre no tendría sentido).
    const q = normTexto(busca)
    const ids = new Set(
      filas
        .filter(
          (f) =>
            (!fSegmento || f.e.segmento === fSegmento) &&
            (!fResp || (fResp === 'sin' ? !f.e.responsable_id : f.e.responsable_id === fResp)) &&
            (!q || f.texto.includes(q)),
        )
        .map((f) => f.e.id),
    )
    return calcularStats({ ...datos, empresas: datos.empresas.filter((e) => ids.has(e.id)) }, { mes, hoy })
  }, [datos, filas, busca, fSegmento, fResp, mes, hoy])

  const porEstatus = useMemo(() => {
    const m = {}
    for (const f of filas) m[f.e.estatus] = (m[f.e.estatus] || 0) + 1
    return m
  }, [filas])

  async function moverA(empresa, estatus) {
    setActionError(null)
    if (estatus === 'perdido' || estatus === 'en_pausa') return setMover({ empresa, estatus })
    // Se ve al instante; si el servidor dice que no, se recarga como estaba.
    setDatos((d) => ({ ...d, empresas: d.empresas.map((e) => (e.id === empresa.id ? { ...e, estatus } : e)) }))
    const { error: err } = await cambiarEstatus(empresa.id, estatus)
    if (err) setActionError(err)
    cargar()
  }

  if (error) return <ErrorState error={error} onRetry={cargar} />
  if (!datos) return <Loading label="Cargando prospectos…" />

  const hayFiltros = busca || (vista === 'lista' && fEstatus) || fSegmento || fResp

  return (
    <div className="page crm">
      <div className="section-header">
        <h2 className="section-title">CRM · Prospectos</h2>
        <div className="crm-acciones">
          {canImportarCrm(role) && (
            <Link to="/crm/importar" className="btn btn--ghost btn--small">
              Importar Excel
            </Link>
          )}
          <button type="button" className="btn btn--primary" onClick={() => setNuevo(true)}>
            + Nuevo prospecto
          </button>
        </div>
      </div>

      <div className="crm-periodo">
        <label>
          <span className="crm-muted">Cifras de</span>
          <select className="input input--small" value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="">Todo</option>
            {meses.map((m) => (
              <option key={m} value={m}>
                {nombreMes(m)}
              </option>
            ))}
          </select>
        </label>
        {mes && <span className="crm-muted">Prospectos con algún contacto registrado en {nombreMes(mes).toLowerCase()}.</span>}
      </div>
      {st && <CrmKpis st={st} />}

      <div className="notas-pestanas crm-pestanas" role="tablist">
        {VISTAS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={vista === v.key}
            className={'notas-pestana' + (vista === v.key ? ' notas-pestana--activa' : '')}
            onClick={() => setVista(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className={'crm-filtros' + (vista !== 'lista' ? ' crm-filtros--sin-estatus' : '')}>
        <input className="input crm-filtros__busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa, contacto o correo…" />
        {vista === 'lista' && (
          <select className="input" value={fEstatus} onChange={(e) => setFEstatus(e.target.value)} aria-label="Estatus">
            <option value="">Todos los estatus</option>
            {CRM_ESTATUS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} ({porEstatus[s.key] || 0})
              </option>
            ))}
          </select>
        )}
        <select className="input" value={fSegmento} onChange={(e) => setFSegmento(e.target.value)} aria-label="Segmento">
          <option value="">Todos los segmentos</option>
          {CRM_SEGMENTOS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <select className="input" value={fResp} onChange={(e) => setFResp(e.target.value)} aria-label="Responsable">
          <option value="">Todos los responsables</option>
          {usuarios.opciones.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
          <option value="sin">Sin responsable</option>
        </select>
      </div>

      <p className="crm-muted crm-conteo">
        {visibles.length === filas.length ? `${filas.length} prospecto${filas.length === 1 ? '' : 's'}` : `${visibles.length} de ${filas.length} prospectos`}
        {vista === 'tablero' && <span className="crm-ayuda-tablero"> · Arrastra una tarjeta para cambiarle el estatus</span>}
        {hayFiltros && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => {
              setBusca('')
              setFEstatus('')
              setFSegmento('')
              setFResp('')
            }}
          >
            Quitar filtros
          </button>
        )}
      </p>

      {actionError && <p className="form-error">{actionError.message}</p>}

      {filas.length === 0 ? (
        <EmptyState>Todavía no hay prospectos. Toca «+ Nuevo prospecto» para agregar el primero.</EmptyState>
      ) : vista === 'tablero' ? (
        <CrmTablero filas={visibles} usuarios={usuarios} hoy={hoy} onMover={moverA} />
      ) : vista === 'estadisticas' ? (
        st && <CrmEstadisticas st={st} usuarios={usuarios} />
      ) : visibles.length === 0 ? (
        <EmptyState>Ningún prospecto coincide con la búsqueda.</EmptyState>
      ) : (
        <ListaTabla filas={visibles} usuarios={usuarios} hoy={hoy} />
      )}

      {nuevo && (
        <NuevoProspectoModal
          usuarios={usuarios}
          onClose={() => setNuevo(false)}
          onCreada={(emp) => navigate(`/crm/${emp.id}`)}
          onAbrir={(id) => navigate(`/crm/${id}`)}
        />
      )}
      {mover && (
        <EstatusModal
          estatus={mover.estatus}
          onClose={() => setMover(null)}
          onConfirmar={async (v) => {
            const { error: err } = await cambiarEstatus(mover.empresa.id, mover.estatus, v)
            if (err) return setActionError(err)
            setMover(null)
            cargar()
          }}
        />
      )}
    </div>
  )
}

function ListaTabla({ filas, usuarios, hoy }) {
  const navigate = useNavigate()
  return (
    <div className="crm-tabla-wrap">
      <table className="simple-table crm-tabla">
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Ubicación</th>
            <th>Contacto principal</th>
            <th>Estatus</th>
            <th>Próximo seguimiento</th>
            <th>Responsable</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(({ e, principal, proximo }) => (
            <tr key={e.id} className="crm-tabla__fila" onClick={() => navigate(`/crm/${e.id}`)}>
              <td data-label="Empresa">
                <Link to={`/crm/${e.id}`} className="crm-tabla__empresa" onClick={(ev) => ev.stopPropagation()}>
                  {e.nombre}
                </Link>
              </td>
              <td data-label="Ubicación">{e.ubicacion || <span className="crm-muted">—</span>}</td>
              <td data-label="Contacto">
                {principal ? (
                  <span>
                    {principal.nombre}
                    {principal.puesto && <span className="crm-muted"> · {principal.puesto}</span>}
                  </span>
                ) : (
                  <span className="crm-muted">—</span>
                )}
              </td>
              <td data-label="Estatus">
                <EstatusBadge estatus={e.estatus} />
              </td>
              <td data-label="Seguimiento">
                {proximo ? (
                  <span className={proximo.fecha < hoy ? 'crm-vencido' : proximo.fecha === hoy ? 'crm-hoy' : ''}>
                    {proximo.fecha === hoy ? 'Hoy' : formatDate(proximo.fecha)}
                    {proximo.fecha < hoy && ' (vencido)'}
                  </span>
                ) : (
                  <span className="crm-muted">—</span>
                )}
              </td>
              <td data-label="Responsable">{usuarios.nombre(e.responsable_id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
