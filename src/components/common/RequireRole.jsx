import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { EmptyState } from './States'
import { esRolDeEstacion } from '../../config/vistasPorRol'

// V111 — pedido del documento de roles de fábrica: "si un usuario entra
// por URL a una pantalla que no le toca, redirigir a su pantalla de
// inicio". Solo tiene sentido para roles con UN home obvio — los de
// estación (incluye costura, vía esRolDeEstacion) y estos dos, cuyo
// Dashboard ya los recibe en modo acotado (EstacionHomePage o el
// Dashboard normal de solo lectura). El resto de los roles (ventas,
// admin_*, etc.) no tienen una sola "pantalla de inicio" obvia, así que
// se quedan con el mensaje de siempre.
const ROLES_CON_INICIO_PROPIO = ['captura_produccion', 'tienda']

// Defensa en profundidad: aunque el nav ya oculta los links a los que no
// tienes acceso, esto evita que alguien entre directo por la URL y vea
// una página que no le corresponde. `allow` es una función (role) => bool
// — usar los helpers de utils/permissions.js.
export default function RequireRole({ allow, children }) {
  const { user, role } = useAuth()

  if (!allow(role)) {
    if (user && (esRolDeEstacion(role) || ROLES_CON_INICIO_PROPIO.includes(role))) {
      return <Navigate to="/" replace />
    }
    return (
      <div className="page page--narrow">
        <EmptyState>
          {user ? (
            'No tienes permiso para ver esta sección.'
          ) : (
            <>
              Inicia sesión para hacer esto. <Link to="/login">Iniciar sesión</Link>
            </>
          )}
        </EmptyState>
      </div>
    )
  }

  return children
}
