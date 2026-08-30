import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { EmptyState } from './States'

// Defensa en profundidad: aunque el nav ya oculta los links a los que no
// tienes acceso, esto evita que alguien entre directo por la URL y vea
// una página que no le corresponde. `allow` es una función (role) => bool
// — usar los helpers de utils/permissions.js.
export default function RequireRole({ allow, children }) {
  const { user, role } = useAuth()

  if (!allow(role)) {
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
