import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { esRutaSistema, esRutaLogin, rutaDesdeHashViejo } from './lib/rutas'

// Direcciones viejas del HashRouter (salperdeportes.com/#/orden/123) → /app/orden/123.
const viejo = rutaDesdeHashViejo(window.location.hash)
if (viejo) window.history.replaceState(null, '', viejo)

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
