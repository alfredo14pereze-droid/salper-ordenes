import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/index.css'
// V117 — rediseño visual (branch rediseno-visual). Ambos archivos solo
// pintan dentro de `.design-root` (ver comentarios en cada uno) — cero
// efecto en cualquier pantalla que no lleve esa clase todavía.
import './styles/design-system.css'
import './styles/dashboard-redesign.css'
import { initPwaInstall } from './lib/pwaInstall'

initPwaInstall()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
