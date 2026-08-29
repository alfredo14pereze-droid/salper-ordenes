import { HashRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ConfigMissing from './components/common/ConfigMissing'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import NewOrderPage from './pages/NewOrderPage'
import OrderDetailPage from './pages/OrderDetailPage'
import CalendarPage from './pages/CalendarPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import PendingItemsPage from './pages/PendingItemsPage'
import UsersPage from './pages/UsersPage'
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

// Nadie ve nada de la app sin haber iniciado sesión — ni siquiera el
// dashboard de solo lectura. Es la puerta única: de aquí para adentro,
// cada página/acción puede asumir que hay un usuario con un rol.
function AuthGate() {
  const { user, loading } = useAuth()

  if (loading) return <Loading label="Cargando…" />
  if (!user) return <LoginPage />

  return (
    <HashRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/nueva" element={<NewOrderPage />} />
          <Route path="/orden/:id" element={<OrderDetailPage />} />
          <Route path="/calendario" element={<CalendarPage />} />
          <Route path="/anuncios" element={<AnnouncementsPage />} />
          <Route path="/pendientes" element={<PendingItemsPage />} />
          <Route path="/usuarios" element={<UsersPage />} />
        </Routes>
      </AppLayout>
    </HashRouter>
  )
}
