import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { canViewInventario } from '../../utils/permissions'
import { EmptyState } from './States'

// V89/V95 — defensa en profundidad para Inventario: el nav ya oculta el link
// a quien no tiene rol para verlo (ver canViewInventario), esto evita que
// alguien entre directo por la URL. El candado real es el servidor (RLS en
// cada tabla y RPC de inv_*).
export default function RequireInventarioAccess({ children }) {
  const { user, role } = useAuth()

  if (!canViewInventario(role)) {
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
