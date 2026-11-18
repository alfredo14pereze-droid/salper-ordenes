import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { NAV, CONTACTO, REDES, linkWhatsApp, HERO } from './content'
import { Icono, IconoWhatsApp, IconoRed } from './Iconos'

// ¿Hay una sesión de Supabase guardada en este navegador? Se lee directo de
// localStorage (la llave que usa supabase-js) para NO cargar Supabase ni hacer
// ninguna llamada a la red desde la página pública.
export function haySesionGuardada() {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL
    if (!url) return false
    const ref = new URL(url).hostname.split('.')[0]
    const raw = localStorage.getItem(`sb-${ref}-auth-token`)
    if (!raw) return false
    const s = JSON.parse(raw)
    return Boolean(s && (s.refresh_token || s.access_token))
  } catch {
    return false
  }
}

function BotonSesion({ className = '' }) {
  const [conSesion] = useState(haySesionGuardada)
  return conSesion ? (
    <a href="/app" className={'ps-btn ps-btn--sesion ' + className}>
      Ir al sistema
    </a>
  ) : (
    <a href="/login" className={'ps-btn ps-btn--sesion ' + className}>
      <Icono nombre="usuario" size={18} />
      Iniciar sesión
    </a>
  )
}

export function Header() {
  const [abierto, setAbierto] = useState(false)
  const [scroll, setScroll] = useState(false)
  const { pathname } = useLocation()
  const enInicio = pathname === '/'

  useEffect(() => {
    const onScroll = () => setScroll(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = abierto ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [abierto])

  const hrefDe = (item) => item.href || (enInicio ? `#${item.id}` : `/#${item.id}`)

  return (
    <header className={'ps-header' + (scroll || !enInicio ? ' ps-header--solido' : '')}>
      <div className="ps-wrap ps-header__fila">
        <Link to="/" className="ps-header__logo" aria-label="SALPER, inicio" onClick={() => setAbierto(false)}>
          <img src="/img/sitio/logo-blanco.png" alt="SALPER" width="120" height="54" />
        </Link>

        <nav className="ps-header__nav" aria-label="Secciones">
          {NAV.map((item) =>
            item.href ? (
              <Link key={item.id} to={item.href} className={pathname === item.href ? 'is-activo' : ''}>
                {item.label}
              </Link>
            ) : (
              <a key={item.id} href={hrefDe(item)}>
                {item.label}
              </a>
            )
          )}
        </nav>

        <div className="ps-header__acciones">
          <BotonSesion className="ps-header__sesion" />
          <button
            type="button"
            className="ps-header__menu"
            aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={abierto}
            onClick={() => setAbierto((v) => !v)}
          >
            <Icono nombre={abierto ? 'cerrar' : 'menu'} size={26} />
          </button>
        </div>
      </div>

      {abierto && (
        <div className="ps-movil" onClick={() => setAbierto(false)}>
          <nav className="ps-movil__panel" aria-label="Menú" onClick={(e) => e.stopPropagation()}>
            {NAV.map((item) =>
              item.href ? (
                <Link key={item.id} to={item.href} onClick={() => setAbierto(false)}>
                  {item.label}
                </Link>
              ) : (
                <a key={item.id} href={hrefDe(item)} onClick={() => setAbierto(false)}>
                  {item.label}
                </a>
              )
            )}
          </nav>
        </div>
      )}
    </header>
  )
}

export function Footer() {
  const redes = Object.entries(REDES).filter(([, url]) => url && url !== '#')
  return (
    <footer id="contacto" className="ps-footer ps-textura">
      <div className="ps-wrap ps-footer__grid">
        <div className="ps-footer__marca">
          <img src="/img/sitio/logo-blanco.png" alt="SALPER" width="180" height="81" loading="lazy" />
          <p className="ps-footer__desde">{HERO.desde}</p>
          <p>{HERO.frase}</p>
        </div>

        <div>
          <h2 className="ps-footer__titulo">{CONTACTO.titulo}</h2>
          <ul className="ps-footer__personas">
            {CONTACTO.personas.map((p) => (
              <li key={p.correo}>
                <strong>{p.nombre}</strong>
                <a href={`tel:+52${p.telefono.replace(/\D/g, '')}`}>
                  <Icono nombre="telefono" size={16} /> {p.telefono}
                </a>
                <a href={`mailto:${p.correo}`}>
                  <Icono nombre="correo" size={16} /> {p.correo}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="ps-footer__cta">
          <a href={linkWhatsApp()} className="ps-btn ps-btn--whatsapp" target="_blank" rel="noopener noreferrer">
            <IconoWhatsApp /> {CONTACTO.botonWhatsApp}
          </a>
          {redes.length > 0 && (
            <div className="ps-footer__redes">
              {redes.map(([red, url]) => (
                <a key={red} href={url} target="_blank" rel="noopener noreferrer" aria-label={red}>
                  <IconoRed red={red} />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="ps-wrap ps-footer__legal">
        © {new Date().getFullYear()} {CONTACTO.copyright}
      </div>
    </footer>
  )
}

export function BotonWhatsAppFlotante() {
  return (
    <a
      href={linkWhatsApp()}
      className="ps-wa-flotante"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
    >
      <IconoWhatsApp size={28} />
    </a>
  )
}
