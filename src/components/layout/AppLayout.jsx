import { NavLink } from 'react-router-dom'
import Logo from './Logo'
import ChatWidget from '../chat/ChatWidget'
import { useAuth } from '../../contexts/AuthContext'
import { canCreateOrder, canManageUsers, ROLE_LABELS } from '../../utils/permissions'

export default function AppLayout({ children }) {
  const { user, profile, role, signOut } = useAuth()

  const navItems = [
    { to: '/', label: 'Dashboard', end: true, show: true },
    { to: '/nueva', label: 'Nueva orden', show: canCreateOrder(role) },
    { to: '/pasadas', label: 'Órdenes pasadas', show: true },
    { to: '/resumen', label: 'Resumen', show: true },
    { to: '/calendario', label: 'Calendario', show: true },
    { to: '/pendientes', label: 'Pendientes', show: true },
    { to: '/anuncios', label: 'Anuncios', show: true },
    { to: '/usuarios', label: 'Usuarios', show: canManageUsers(role) },
  ]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <Logo />
          <span className="app-header__subtitle">Órdenes de producción</span>
        </div>
        <nav className="app-nav">
          {navItems
            .filter((item) => item.show)
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => 'app-nav__link' + (isActive ? ' app-nav__link--active' : '')}
              >
                {item.label}
              </NavLink>
            ))}
        </nav>
        <div className="app-header__user">
          {user ? (
            <>
              <span className="app-header__user-name">
                {profile?.full_name || 'Sin nombre'}
                <span className="app-header__user-role">{ROLE_LABELS[role] || role}</span>
              </span>
              <button type="button" className="btn btn--ghost btn--small" onClick={signOut}>
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <span className="app-header__user-name">
                Invitado
                <span className="app-header__user-role">Solo lectura</span>
              </span>
              <NavLink
                to="/login"
                className="btn btn--primary btn--small"
                style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
              >
                Iniciar sesión
              </NavLink>
            </>
          )}
        </div>
      </header>
      <main className="app-main">{children}</main>
      <ChatWidget />
    </div>
  )
}
