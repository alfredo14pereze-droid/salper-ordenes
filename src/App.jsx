import { HashRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ConfigMissing from './components/common/ConfigMissing'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PastOrdersPage from './pages/PastOrdersPage'
import ResumenPage from './pages/ResumenPage'
import NewOrderPage from './pages/NewOrderPage'
import OrderDetailPage from './pages/OrderDetailPage'
import CalendarPage from './pages/CalendarPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import PendingItemsPage from './pages/PendingItemsPage'
import UsersPage from './pages/UsersPage'
import PedidosTiendaPage from './pages/PedidosTiendaPage'
import NewPedidoTiendaPage from './pages/NewPedidoTiendaPage'
import PedidoTiendaDetailPage from './pages/PedidoTiendaDetailPage'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Loading } from './components/common/States'

// HashRouter (en vez de BrowserRouter) para que las rutas funcionen igual
// en Vercel y en GitHub Pages sin configuración extra de reescritura de URLs.
export default function App() {
  if (!isSupabaseConfigured) {
    return <ConfigMissing />
  }

  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}

// Modo invitado: quien entra al link sin haber iniciado sesión ve la app
// completa en modo lectura (Dashboard, calendario, detalle de órdenes,
// anuncios, pendientes) — nunca la pantalla de login primero. Ningún
// botón de crear/editar/cambiar aparece sin sesión (cada componente lo
// decide solo, vía useAuth().role/user — ver utils/permissions.js), y el
// servidor rechaza cualquier escritura sin sesión de todos modos (RLS +
// RPCs "to authenticated", ver supabase/schema_v9_security_fix.sql). El
// login vive en /login, no como puerta de entrada.
function AuthGate() {
  const { loading } = useAuth()

  if (loading) return <Loading label="Cargando…" />

  return (
    <HashRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/pasadas" element={<PastOrdersPage />} />
          <Route path="/resumen" element={<ResumenPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/nueva" element={<NewOrderPage />} />
          <Route path="/orden/:id" element={<OrderDetailPage />} />
          <Route path="/calendario" element={<CalendarPage />} />
          <Route path="/anuncios" element={<AnnouncementsPage />} />
          <Route path="/pendientes" element={<PendingItemsPage />} />
          <Route path="/usuarios" element={<UsersPage />} />
          <Route path="/pedidos-proveedor" element={<PedidosTiendaPage />} />
          <Route path="/pedidos-proveedor/nuevo" element={<NewPedidoTiendaPage />} />
          <Route path="/pedidos-proveedor/:id" element={<PedidoTiendaDetailPage />} />
        </Routes>
      </AppLayout>
    </HashRouter>
  )
}
