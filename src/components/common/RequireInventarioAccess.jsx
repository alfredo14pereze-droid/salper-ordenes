import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { canViewInventario, isInventarioBetaUser } from '../../utils/permissions'
import { EmptyState } from './States'

// V89 — Inventario en modo prueba: además del rol (canViewInventario), solo
// tu cuenta puede entrar (ver INVENTARIO_BETA_EMAIL en utils/permissions.js).
// El candado real vive en el servidor (RLS de inv_acceso_beta) — esto solo
// evita que alguien con permiso de rol pero sin el correo beta vea una
// pantalla vacía de errores de RLS en vez de un mensaje claro.
export default function RequireInventarioAccess({ children }) {
  const { user, role } = useAuth()

  if (!canViewInventario(role) || !isInventarioBetaUser(user)) {
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
