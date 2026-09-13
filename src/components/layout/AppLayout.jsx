import { NavLink } from 'react-router-dom'
import Logo from './Logo'
import ChatWidget from '../chat/ChatWidget'
import { useAuth } from '../../contexts/AuthContext'
import {
  canCreateOrder,
  canManageCatalogs,
  canManageUsers,
  canViewPedidosTienda,
  hasRestrictedNav,
  isTiendaBasica,
  ROLE_LABELS,
} from '../../utils/permissions'

export default function AppLayout({ children }) {
  const { user, profile, role, signOut } = useAuth()
  // Los 5 roles de etapa de fábrica (corte/bordado/sublimado/producción/
  // terminado) solo necesitan Dashboard + Resumen para hacer su trabajo —
  // ver hasRestrictedNav en utils/permissions.js. admin_fabrica sigue
  // viendo todo.
  const restricted = hasRestrictedNav(role)
  // V30 — rol 'tienda': todavía más angosto, solo Dashboard + Pendientes
  // ("que no le aparezca nada más", pedido explícito del usuario). No se
  // combina con `restricted` porque las formas no coinciden (ver
  // isTiendaBasica en utils/permissions.js).
  const tiendaBasica = isTiendaBasica(role)

  const navItems = [
    { to: '/', label: 'Dashboard', end: true, show: true },
    { to: '/nueva', label: 'Nueva orden', show: canCreateOrder(role) },
    { to: '/pasadas', label: 'Órdenes pasadas', show: !restricted && !tiendaBasica },
    { to: '/resumen', label: 'Resumen', show: !tiendaBasica },
    { to: '/calendario', label: 'Calendario', show: !restricted && !tiendaBasica },
    { to: '/pendientes', label: 'Pendientes', show: !restricted },
    { to: '/anuncios', label: 'Anuncios', show: !restricted && !tiendaBasica },
    // Módulo independiente de órdenes, sin modo invitado — solo aparece
    // con sesión (ver canViewPedidosTienda).
    { to: '/pedidos-proveedor', label: 'Pedidos a Proveedor', show: !restricted && !tiendaBasica && canViewPedidosTienda(role) },
    // Control rápido: visible para cualquier cuenta (desde V29 ya no hay
    // modo invitado, pero sigue sin restringirse por rol) — excepto
    // 'tienda', que solo debe ver Dashboard + Pendientes.
    { to: '/control-rapido', label: 'Control rápido', show: !tiendaBasica },
    { to: '/catalogos', label: 'Catálogos', show: canManageCatalogs(role) },
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
