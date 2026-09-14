import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import Logo from './Logo'
import ChatWidget from '../chat/ChatWidget'
import { useAuth } from '../../contexts/AuthContext'
import {
  canCreateOrder,
  canViewCatalogos,
  canManageUsers,
  canViewPedidosTienda,
  canViewEstadisticas,
  hasRestrictedNav,
  isTiendaBasica,
  ROLE_LABELS,
} from '../../utils/permissions'
import { PEDIDOS_PROVEEDOR_HABILITADO } from '../../utils/featureFlags'

// V34: el nav pasó de barra horizontal arriba a menú lateral (pedido
// explícito del usuario — con tantas secciones, la barra de arriba se
// empezaba a amontonar). "Órdenes pasadas", "Control rápido" y "Resumen"
// ya no viven aquí — se movieron a ser botones dentro del propio
// Dashboard (ver DashboardPage.jsx) para dejar el menú más corto todavía.
// "Estadísticas" (V35) empezó ahí también, pero V36 la subió a su propia
// pestaña aquí — el usuario la quiso separada, no como botón, y visible
// solo para los 3 roles admin_* (ver canViewEstadisticas).
//
// En celular el sidebar se esconde fuera de la pantalla (ver
// .app-sidebar en index.css) y se abre con el botón de hamburguesa de
// la barra superior — `sidebarOpen` controla eso; se cierra solo al
// navegar (onClick en cada link) o al tocar el overlay oscuro detrás.
export default function AppLayout({ children }) {
  const { user, profile, role, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
    { to: '/estadisticas', label: 'Estadísticas', show: canViewEstadisticas(role) },
    { to: '/calendario', label: 'Calendario', show: !restricted && !tiendaBasica },
    { to: '/pendientes', label: 'Pendientes', show: !restricted },
    { to: '/anuncios', label: 'Anuncios', show: !restricted && !tiendaBasica },
    // Módulo independiente de órdenes, sin modo invitado — solo aparece
    // con sesión (ver canViewPedidosTienda). V31: apagado en producción
    // por ahora (PEDIDOS_PROVEEDOR_HABILITADO) — sigue completo en la
    // rama `dev`.
    {
      to: '/pedidos-proveedor',
      label: 'Pedidos a Proveedor',
      show: PEDIDOS_PROVEEDOR_HABILITADO && !restricted && !tiendaBasica && canViewPedidosTienda(role),
    },
    { to: '/catalogos', label: 'Catálogos', show: canViewCatalogos(role) },
    { to: '/usuarios', label: 'Usuarios', show: canManageUsers(role) },
  ]

  function closeSidebar() {
    setSidebarOpen(false)
  }

  return (
    <div className="app-shell">
      {/* Barra superior — solo visible en celular (ver @media en
          index.css); en escritorio el sidebar ya está siempre abierto. */}
      <div className="app-topbar">
        <button
          type="button"
          className="app-topbar__menu-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir menú"
        >
          ☰
        </button>
        <Logo />
      </div>

      {sidebarOpen && <div className="app-sidebar-overlay" onClick={closeSidebar} />}

      <aside className={'app-sidebar' + (sidebarOpen ? ' app-sidebar--open' : '')}>
        <div className="app-sidebar__brand">
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
                onClick={closeSidebar}
                className={({ isActive }) => 'app-nav__link' + (isActive ? ' app-nav__link--active' : '')}
              >
                {item.label}
              </NavLink>
            ))}
        </nav>

        <div className="app-sidebar__user">
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
                onClick={closeSidebar}
                className="btn btn--primary btn--small"
                style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
              >
                Iniciar sesión
              </NavLink>
            </>
          )}
        </div>
      </aside>

      <main className="app-main">{children}</main>
      <ChatWidget />
    </div>
  )
}
