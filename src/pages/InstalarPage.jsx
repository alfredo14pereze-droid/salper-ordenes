import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/layout/Logo'
import { useAuth } from '../contexts/AuthContext'
import { canPromptInstall, detectDevice, isStandalone, promptInstall, subscribeInstall } from '../lib/pwaInstall'

// Pública (sin sesión): se monta también fuera de AppLayout. Ver App.jsx.
export default function InstalarPage() {
  const { user } = useAuth()
  const [, force] = useState(0)
  const [outcome, setOutcome] = useState(null)
  const [installed, setInstalled] = useState(isStandalone())
  const device = detectDevice()

  useEffect(() => subscribeInstall(() => force((n) => n + 1)), [])
  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)')
    const onChange = () => setInstalled(isStandalone())
    mq.addEventListener?.('change', onChange)
    window.addEventListener('appinstalled', onChange)
    return () => {
      mq.removeEventListener?.('change', onChange)
      window.removeEventListener('appinstalled', onChange)
    }
  }, [])

  async function handleInstall() {
    setOutcome(await promptInstall())
  }

  return (
    <div className="login-page">
      <div className="login-card install-card">
        <div className="login-card__brand">
          <Logo />
          <span className="app-header__subtitle">Instalar la app</span>
        </div>

        {installed ? (
          <p className="install-card__ok">Ya tienes la app instalada.</p>
        ) : device.ios ? (
          <IosSteps device={device} />
        ) : canPromptInstall() ? (
          <>
            <p>Instala SALPER para abrirlo en pantalla completa, como una app, con su propio ícono.</p>
            <button type="button" className="btn btn--primary" onClick={handleInstall}>
              Instalar
            </button>
            {outcome === 'dismissed' && <p className="login-card__hint">Cancelaste la instalación. Puedes intentarlo cuando quieras.</p>}
          </>
        ) : (
          <>
            <p>
              {device.android
                ? 'Abre esta página en Chrome. Si no aparece el botón "Instalar", abre el menú ⋮ y elige "Instalar app" o "Agregar a la pantalla principal".'
                : 'Usa Chrome o Edge. Si no aparece el botón "Instalar", busca el ícono de instalar en la barra de direcciones (a la derecha) o en el menú ⋮ → "Instalar SALPER".'}
            </p>
            <p className="login-card__hint">Safari en Mac: menú Archivo → "Agregar al Dock".</p>
          </>
        )}

        <p className="login-card__hint">
          Al abrir la app instalada por primera vez tendrás que iniciar sesión una vez (en iPhone la app no comparte la sesión con Safari).
        </p>
        <p className="login-card__hint">
          <Link to={user ? '/' : '/login'}>{user ? 'Ir al dashboard' : 'Ir a iniciar sesión'}</Link>
        </p>
      </div>
    </div>
  )
}

function IosSteps({ device }) {
  if (!device.iosSafari) {
    return (
      <>
        <p>
          <strong>En {device.ipad ? 'iPad' : 'iPhone'} la instalación solo funciona desde Safari.</strong>
        </p>
        <p>Copia este enlace, ábrelo en Safari y sigue los pasos de esa página.</p>
      </>
    )
  }
  return (
    <>
      <p>Para instalar SALPER en tu {device.ipad ? 'iPad' : 'iPhone'} (debes estar en Safari):</p>
      <ol className="install-steps">
        <li>
          Toca el botón <strong>Compartir</strong> (el cuadro con la flecha hacia arriba, abajo en la pantalla{device.ipad ? ' o arriba a la derecha' : ''}).
        </li>
        <li>
          Desliza el menú y toca <strong>Agregar a pantalla de inicio</strong>.
        </li>
        <li>
          Deja el nombre "SALPER" y toca <strong>Agregar</strong>.
        </li>
        <li>Abre SALPER desde el ícono en tu pantalla de inicio e inicia sesión.</li>
      </ol>
    </>
  )
}
