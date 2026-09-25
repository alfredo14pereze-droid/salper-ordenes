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
import CatalogosPage from './pages/CatalogosPage'
import ControlRapidoPage from './pages/ControlRapidoPage'
import EstadisticasPage from './pages/EstadisticasPage'
import PedidosColegioPage from './pages/PedidosColegioPage'
import TallerosPage from './pages/TallerosPage'
import ProduccionCapturaPage from './pages/ProduccionCapturaPage'
import TalleroDetailPage from './pages/TalleroDetailPage'
import NewPedidoColegioPage from './pages/NewPedidoColegioPage'
import PedidoColegioDetailPage from './pages/PedidoColegioDetailPage'
import FeatureDisabledPage from './components/common/FeatureDisabledPage'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Loading } from './components/common/States'
import { PEDIDOS_PROVEEDOR_HABILITADO } from './utils/featureFlags'

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

// V29 — se quitó el "modo invitado": SALPER es un sistema interno y no
// debe verlo nadie externo a la empresa. Antes de V29, quien entraba al
// link sin sesión veía la app completa en modo lectura (Dashboard,
// calendario, órdenes, etc.) — eso era a propósito en su momento, pero
// el usuario pidió expresamente cerrarlo. Ahora, sin sesión, lo único que
// se monta es LoginPage — ninguna ruta, ningún dato, ni el nav de
// AppLayout. El servidor refuerza esto mismo del lado de la base
// (schema_v29_no_acceso_externo.sql revoca el acceso de `anon` al schema
// `public` por completo), así que aunque alguien se saltara este
// chequeo del cliente, la base ya no le regresa nada de todos modos.
function AuthGate() {
  const { loading, user } = useAuth()

  if (loading) return <Loading label="Cargando…" />

  if (!user) {
    return (
      <HashRouter>
        <LoginPage />
      </HashRouter>
    )
  }

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
          <Route path="/catalogos" element={<CatalogosPage />} />
          <Route path="/control-rapido" element={<ControlRapidoPage />} />
          <Route path="/estadisticas" element={<EstadisticasPage />} />
          {/* V57 — Pedidos Colegio (beta): cada página se protege sola con
              RequireRole (solo admin_general); el servidor lo exige igual. */}
          <Route path="/produccion/captura" element={<ProduccionCapturaPage />} />
          <Route path="/talleros" element={<TallerosPage />} />
          <Route path="/talleros/:id" element={<TalleroDetailPage />} />
          <Route path="/pedidos-colegio" element={<PedidosColegioPage />} />
          <Route path="/pedidos-colegio/nuevo" element={<NewPedidoColegioPage />} />
          <Route path="/pedidos-colegio/:id" element={<PedidoColegioDetailPage />} />
          <Route
            path="/pedidos-proveedor"
            element={PEDIDOS_PROVEEDOR_HABILITADO ? <PedidosTiendaPage /> : <FeatureDisabledPage />}
          />
          <Route
            path="/pedidos-proveedor/nuevo"
            element={PEDIDOS_PROVEEDOR_HABILITADO ? <NewPedidoTiendaPage /> : <FeatureDisabledPage />}
          />
          <Route
            path="/pedidos-proveedor/:id"
            element={PEDIDOS_PROVEEDOR_HABILITADO ? <PedidoTiendaDetailPage /> : <FeatureDisabledPage />}
          />
        </Routes>
      </AppLayout>
    </HashRouter>
  )
}
