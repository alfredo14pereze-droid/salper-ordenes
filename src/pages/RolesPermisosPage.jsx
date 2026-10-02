import { useCallback, useEffect, useMemo, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canManageUsers, ROLE_LABELS, ROLES_ASIGNABLES } from '../utils/permissions'
import {
  fetchPermisosCatalogo,
  fetchRolPermisos,
  fetchRolPermisosLog,
  setRolPermiso,
} from '../services/permisosService'

// V125 — Roles y permisos (Fase 1). Se elige un rol y se marca/desmarca qué
// puede hacer en cada módulo. Cada casilla guarda al instante por el RPC
// admin_set_rol_permiso (solo admin_general); el servidor es quien manda — esta
// pantalla nunca decide permisos, solo los edita. Cubre Inventario de tienda,
// Precios y facturación, Pendientes y Producción; el resto de módulos se
// migra en fases siguientes.

function fmtFecha(iso) {
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function RolesPermisosContent() {
  const { refreshProfile } = useAuth()
  const [catalogo, setCatalogo] = useState([])
  const [filas, setFilas] = useState([]) // [{ rol, clave }]
  const [log, setLog] = useState([])
  const [rol, setRol] = useState('ventas')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(null) // clave en guardado
  const [saveError, setSaveError] = useState(null)

  const cargar = useCallback(async () => {
    const [c, f, l] = await Promise.all([fetchPermisosCatalogo(), fetchRolPermisos(), fetchRolPermisosLog()])
    if (c.error || f.error) {
      setError(c.error || f.error)
    } else {
      setCatalogo(c.data || [])
      setFilas(f.data || [])
      setLog(l.data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const activos = useMemo(() => new Set(filas.filter((x) => x.rol === rol).map((x) => x.clave)), [filas, rol])

  const porModulo = useMemo(() => {
    const m = new Map()
    for (const p of catalogo) {
      if (!m.has(p.modulo)) m.set(p.modulo, [])
      m.get(p.modulo).push(p)
    }
    return [...m.entries()]
  }, [catalogo])

  const bloqueado = rol === 'admin_general'

  async function toggle(clave, permitido) {
    setSaving(clave)
    setSaveError(null)
    const { error: err } = await setRolPermiso(rol, clave, permitido)
    if (err) {
      setSaveError(err.message)
    } else {
      setFilas((prev) =>
        permitido
          ? [...prev, { rol, clave }]
          : prev.filter((x) => !(x.rol === rol && x.clave === clave)),
      )
      // Refresca el mapa que usa el resto de la app y el historial.
      refreshProfile()
      const l = await fetchRolPermisosLog()
      if (!l.error) setLog(l.data || [])
    }
    setSaving(null)
  }

  if (loading) return <Loading />
  if (error) {
    return (
      <ErrorState
        error={new Error(`No se pudieron cargar los permisos (${error.message}). ¿Ya se aplicó la migración V125?`)}
        onRetry={cargar}
      />
    )
  }

  const etiquetaDe = (clave) => catalogo.find((p) => p.clave === clave)?.etiqueta || clave

  return (
    <div className="page page--narrow">
      <h2 className="section-title">Roles y permisos</h2>
      <p className="page-subtitle">
        Elige un rol y marca lo que puede hacer. Los cambios se guardan al instante y aplican la próxima vez que esa
        persona abra o recargue la app. Por ahora aquí se controlan <strong>Inventario de tienda, Precios y
        facturación, Pendientes y Producción</strong>; el resto de los módulos se irán agregando.
      </p>

      <label className="roles-perm__selector">
        <span>Rol</span>
        <select className="input" value={rol} onChange={(e) => setRol(e.target.value)}>
          {ROLES_ASIGNABLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r] || r}
            </option>
          ))}
        </select>
      </label>

      {bloqueado && (
        <p className="roles-perm__nota">
          El administrador general siempre tiene todo: no se puede cambiar, para que nunca te quedes sin acceso.
        </p>
      )}
      {saveError && <p className="form-error">No se pudo guardar: {saveError}</p>}

      {porModulo.map(([modulo, permisos]) => (
        <section key={modulo} className="card roles-perm__modulo">
          <h3 className="roles-perm__titulo">{modulo}</h3>
          {permisos.map((p) => {
            const marcado = activos.has(p.clave)
            return (
              <label key={p.clave} className="roles-perm__fila">
                <input
                  type="checkbox"
                  checked={marcado}
                  disabled={bloqueado || saving === p.clave}
                  onChange={(e) => toggle(p.clave, e.target.checked)}
                />
                <span className="roles-perm__texto">
                  <span className="roles-perm__etiqueta">
                    {p.etiqueta}
                    <span className={`roles-perm__nivel roles-perm__nivel--${p.nivel}`}>
                      {p.nivel === 'editar' ? 'Puede modificar' : 'Solo ver'}
                    </span>
                  </span>
                  {p.descripcion && <span className="roles-perm__desc">{p.descripcion}</span>}
                </span>
              </label>
            )
          })}
        </section>
      ))}

      <section className="card roles-perm__modulo">
        <h3 className="roles-perm__titulo">Últimos cambios</h3>
        {log.length === 0 ? (
          <p className="roles-perm__desc">Todavía no se ha cambiado ningún permiso desde aquí.</p>
        ) : (
          <ul className="roles-perm__log">
            {log.map((x) => (
              <li key={x.id}>
                <span className="roles-perm__desc">{fmtFecha(x.cambiado_en)}</span>{' '}
                {x.cambiado_por_nombre || 'Alguien'} {x.permitido ? 'permitió' : 'quitó'} «{etiquetaDe(x.clave)}» a{' '}
                <strong>{ROLE_LABELS[x.rol] || x.rol}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default function RolesPermisosPage() {
  return (
    <RequireRole allow={canManageUsers}>
      <RolesPermisosContent />
    </RequireRole>
  )
}
