import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Landing from './Landing'
import Catalogo from './CatalogoPage'
import './public-site.css'

// Primer tramo de rutas que existían en el sistema (antes /#/...). Si alguien
// llega a salperdeportes.com/pendientes (sin el #), se le manda a /app/pendientes.
const RUTAS_DEL_SISTEMA = [
  'pasadas', 'resumen', 'nueva', 'orden', 'ordenes', 'calendario', 'anuncios', 'pendientes', 'notas-tienda', 'tareas',
  'manuales', 'hojas-impresas', 'atr', 'crm', 'entregas', 'pedidos', 'pedido', 'usuarios', 'roles-permisos', 'design',
  'catalogos', 'inventario-tela', 'consumos-prenda', 'control-rapido', 'estadisticas', 'produccion', 'cotizador',
  'estadisticas-produccion', 'talleros', 'inventario', 'frisa', 'pedidos-colegio', 'pedidos-proveedor', 'instalar', 'dashboard',
]

function RutaDesconocida() {
  const { pathname, search } = useLocation()
  const primero = pathname.split('/')[1]
  useEffect(() => {
    if (RUTAS_DEL_SISTEMA.includes(primero)) window.location.replace('/app' + pathname + search)
  }, [primero, pathname, search])
  if (RUTAS_DEL_SISTEMA.includes(primero)) return null
  return <Navigate to="/" replace />
}

// Al cambiar de página, arriba (o al ancla #seccion si viene en la URL).
function ScrollAlCambiar() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) {
        el.scrollIntoView()
        return
      }
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export default function PublicApp() {
  return (
    <BrowserRouter>
      <ScrollAlCambiar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="*" element={<RutaDesconocida />} />
      </Routes>
    </BrowserRouter>
  )
}
