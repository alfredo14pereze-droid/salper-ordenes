import { NavLink } from 'react-router-dom'
import Logo from './Logo'

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/nueva', label: 'Nueva orden' },
  { to: '/calendario', label: 'Calendario' },
  { to: '/pendientes', label: 'Pendientes' },
  { to: '/anuncios', label: 'Anuncios' },
]

export default function AppLayout({ children }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <Logo />
          <span className="app-header__subtitle">Órdenes de producción</span>
        </div>
        <nav className="app-nav">
          {navItems.map((item) => (
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
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
