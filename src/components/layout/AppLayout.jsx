import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import ErrorBoundary from '../common/ErrorBoundary'
import Logo from './Logo'
import ChatWidget from '../chat/ChatWidget'
import { useAuth } from '../../contexts/AuthContext'
import {
  canCreateOrder,
  canViewCatalogos,
  canManageUsers,
  canManagePedidosColegio,
  canViewTalleros,
  isCapturaProduccion,
  canCapturarProduccion,
  canViewProduccionMontos,
  canVerRankingProduccion,
  canViewPedidosTienda,
  canViewEstadisticas,
  canViewPendientes,
  canViewInventario,
  canRegistrarEntradaTela,
  canGestionarConsumosPrenda,
  hasRestrictedNav,
  isTiendaBasica,
  puedeVerComoOtroRol,
  FABRICA_ETAPA_ROLES,
  ROLE_LABELS,
} from '../../utils/permissions'
import { esRolDeEstacion } from '../../config/vistasPorRol'
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
// V53 — orden fijo de opciones para "Ver como" (mismos roles que
// ROLE_LABELS, sin admin_general: ese es "mi vista", no una opción de
// disfraz).
const VIEW_AS_ROLES = [
  'ventas',
  'contabilidad',
  'admin_tienda',
  'corte',
  'bordado',
  'sublimado',
  'produccion',
  'costura',
  'terminado',
  'admin_fabrica',
  'admin_fabrica_lectura',
  'lectura',
  'tienda',
  'captura_produccion',
]

export default function AppLayout({ children }) {
  const { user, profile, role, trueRole, viewAsRole, setViewAsRole, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
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
  // V66 — Juanis (captura_produccion): solo Dashboard (consultar órdenes) y,
  // desde la Fase 3, la pantalla de captura. V111 amplía la lista blanca:
  // Anuncios (solo lectura), Control rápido, e Inventario de tela (solo
  // entradas). Nada más en el menú.
  const soloCaptura = isCapturaProduccion(role)
  const RUTAS_CAPTURA = ['/', '/anuncios', '/control-rapido', '/inventario-tela']
  // V96 — los 5 roles de etapa de fábrica (o admin_fabrica "viendo como"
  // uno de ellos) no llevan sidebar ni chat — vista de estación, mínima
  // de verdad. Usa `role` (el efectivo), no `trueRole`, a propósito: así
  // admin_fabrica ve exactamente el mismo shell que vería ese rol.
  const esEstacion = esRolDeEstacion(role)
  // V96 — "Ver como" (V53) ya no es exclusivo de admin_general: admin_fabrica
  // también lo tiene, pero solo para probar los 5 roles de etapa (no
  // ventas/contabilidad/etc., eso es dominio de admin_general).
  const opcionesVerComo = trueRole === 'admin_fabrica' ? FABRICA_ETAPA_ROLES : VIEW_AS_ROLES

  const navItems = [
    { to: '/', label: 'Dashboard', end: true, show: true },
    { to: '/nueva', label: 'Nueva orden', show: canCreateOrder(role) },
    { to: '/estadisticas', label: 'Estadísticas', show: canViewEstadisticas(role) },
    // V72 — estadísticas de producción (admin_general / admin_fabrica).
    { to: '/estadisticas-produccion', label: 'Estadísticas de producción', show: canViewProduccionMontos(role) },
    { to: '/calendario', label: 'Calendario', show: !restricted && !tiendaBasica },
    // V78 — pendientes tienda <-> fábrica: los roles de fábrica también lo ven.
    { to: '/pendientes', label: 'Pendientes', show: canViewPendientes(role) },
    // V24 — de solo lectura para todos, invitados incluidos; le faltaba
    // aparecer en el menú (antes solo se llegaba por URL directa).
    { to: '/control-rapido', label: 'Control rápido', show: true },
    // V111 — antes oculto para los 5 roles de estación (V22); ahora lo
    // ven de solo lectura (canManageAnnouncements ya los excluye de
    // publicar/borrar).
    { to: '/anuncios', label: 'Anuncios', show: !tiendaBasica },
    // Módulo independiente de órdenes, sin modo invitado — solo aparece
    // con sesión (ver canViewPedidosTienda). V31: apagado en producción
    // por ahora (PEDIDOS_PROVEEDOR_HABILITADO) — sigue completo en la
    // rama `dev`.
    {
      to: '/pedidos-proveedor',
      label: 'Pedidos a Proveedor',
      show: PEDIDOS_PROVEEDOR_HABILITADO && !restricted && !tiendaBasica && canViewPedidosTienda(role),
    },
    // V68 — captura de producción (Juanis + admin_general/admin_fabrica).
    { to: '/produccion/captura', label: 'Producción', show: canCapturarProduccion(role) },
    // V69 — revisión/aprobación semanal (con montos: solo admin_general/admin_fabrica).
    { to: '/produccion/revision', label: 'Revisión producción', show: canViewProduccionMontos(role) },
    // V70 — dashboard/imprimibles y administración de catálogos de producción.
    // V103 — también captura_produccion (Juanis), ver ranking/valor generado.
    { to: '/produccion/dashboard', label: 'Dashboard producción', show: canVerRankingProduccion(role) },
    { to: '/produccion/admin', label: 'Admin producción', show: canViewProduccionMontos(role) },
    // V63 — visible también para fábrica (ver canViewTalleros).
    { to: '/talleros', label: 'Talleros', show: canViewTalleros(role) },
    // V95 — Inventario ya abierto por rol (ver canViewInventario).
    { to: '/inventario', label: 'Inventario', show: canViewInventario(role) },
    // V100 — Entrada/Ajuste de tela, admin_fabrica/admin_general.
    // V111 — también captura_produccion (Juanis), solo para entradas —
    // dentro de la pantalla se le oculta "Ajuste" (ver InventarioTelaPage.jsx).
    { to: '/inventario-tela', label: 'Inventario de tela', show: canRegistrarEntradaTela(role) },
    // V101 — rendimientos de tela por prenda, exclusivo admin_fabrica/admin_general.
    { to: '/consumos-prenda', label: 'Consumos por prenda', show: canGestionarConsumosPrenda(role) },
    { to: '/catalogos', label: 'Catálogos', show: canViewCatalogos(role) },
    // V57 — beta oculta: solo admin_general (ver canManagePedidosColegio).
    { to: '/pedidos-colegio', label: 'Pedidos Colegio', show: canManagePedidosColegio(role) },
    { to: '/usuarios', label: 'Usuarios', show: canManageUsers(role) },
  ]

  function closeSidebar() {
    setSidebarOpen(false)
  }

  // V96/V97 — shell mínimo para las vistas de estación: sin sidebar
  // completo ni ChatWidget, pero SÍ con 2 links ("Órdenes" y "Pendientes"
  // — este último ya era parte de su trabajo desde V78) para no dejar a
  // alguien varado en una pantalla sin forma de volver a la lista de
  // órdenes. El banner de "Ver como" se conserva — es la única forma de
  // que admin_fabrica regrese a su vista completa mientras prueba una
  // estación.
  if (esEstacion) {
    return (
      <div className="app-shell app-shell--estacion">
        <div className="app-topbar app-topbar--estacion">
          <Logo />
          <nav className="estacion-nav">
            <NavLink to="/" end className={({ isActive }) => 'estacion-nav__link' + (isActive ? ' estacion-nav__link--active' : '')}>
              Órdenes
            </NavLink>
            {canViewPendientes(role) && (
              <NavLink to="/pendientes" className={({ isActive }) => 'estacion-nav__link' + (isActive ? ' estacion-nav__link--active' : '')}>
                Pendientes
              </NavLink>
            )}
          </nav>
          {user && (
            <button type="button" className="btn btn--ghost btn--small" onClick={signOut}>
              Cerrar sesión
            </button>
          )}
        </div>
        <main className="app-main">
          {viewAsRole && (
            <div className="view-as-banner">
              Viendo como <strong>{ROLE_LABELS[viewAsRole] || viewAsRole}</strong> — así es como se ve el sistema para ese rol.
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setViewAsRole(null)}>
                Volver a mi vista
              </button>
            </div>
          )}
          <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>
        </main>
      </div>
    )
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
          <span className="app-header__subtitle">Sistema Operativo</span>
        </div>

        <nav className="app-nav">
          {navItems
            .filter((item) => item.show && (!soloCaptura || RUTAS_CAPTURA.includes(item.to) || item.to.startsWith('/produccion')))
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
          {/* V53/V96 — "Ver como": admin_general (cualquier rol) y
              admin_fabrica (solo las 5 estaciones — ver opcionesVerComo).
              Usa trueRole, no `role` — si ya se está viendo como otro rol,
              el selector debe seguir apareciendo para poder regresar o
              cambiar a un tercero. Solo cambia qué se ve en pantalla — el
              servidor sigue validando el rol real en cada RPC. */}
          {puedeVerComoOtroRol(trueRole) && (
            <label className="view-as-picker">
              Ver como
              <select
                className="input input--small"
                value={viewAsRole || ''}
                onChange={(e) => setViewAsRole(e.target.value || null)}
              >
                <option value="">Mi vista ({ROLE_LABELS[trueRole] || trueRole})</option>
                {opcionesVerComo.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
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

      <main className="app-main">
        {viewAsRole && (
          <div className="view-as-banner">
            Viendo como <strong>{ROLE_LABELS[viewAsRole] || viewAsRole}</strong> — así es como se ve el sistema para ese rol.
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setViewAsRole(null)}>
              Volver a mi vista
            </button>
          </div>
        )}
        {/* V59: un error al pintar una pantalla ya no deja toda la app en
            blanco — se contiene aquí (ver ErrorBoundary). `key` lo reinicia al
            cambiar de ruta. */}
        <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>
      </main>
      {!soloCaptura && <ChatWidget />}
    </div>
  )
}
