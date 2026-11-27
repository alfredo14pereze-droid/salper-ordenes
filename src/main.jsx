import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { esRutaSistema, esRutaLogin, rutaDesdeHashViejo } from './lib/rutas'

// Direcciones viejas del HashRouter (salperdeportes.com/#/orden/123) → /app/orden/123.
const viejo = rutaDesdeHashViejo(window.location.hash)
if (viejo) window.history.replaceState(null, '', viejo)

// 2026-11-27 — Celular: respaldo contra el zoom con dos dedos (iOS ignora
// user-scalable=no del viewport). Solo frena gestos de 2+ dedos: el scroll
// normal y los menús deslizables (un dedo) siguen igual.
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault()
  },
  { passive: false }
)

const { pathname } = window.location
const esSistema = esRutaSistema(pathname) || esRutaLogin(pathname)

// La página pública y el sistema se cargan por separado: quien abre el sitio
// desde WhatsApp no descarga el sistema (ni Supabase), y viceversa.
const Raiz = esSistema ? lazy(() => import('./App.jsx')) : lazy(() => import('./public-site/PublicApp.jsx'))

if (esSistema) {
  // El evento beforeinstallprompt llega pronto: se captura desde el arranque.
  import('./lib/pwaInstall').then((m) => m.initPwaInstall())
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Raiz />
    </Suspense>
  </React.StrictMode>
)
