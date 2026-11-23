import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './styles/index.css'
// V117 — rediseño visual (branch rediseno-visual). Ambos archivos solo
// pintan dentro de `.design-root` — cero efecto fuera de esa clase.
import './styles/design-system.css'
import './styles/dashboard-redesign.css'
import { BASE_SISTEMA, esRutaLogin, irA, estaSaliendo } from './lib/rutas'
import AppLayout from './components/layout/AppLayout'
import ConfigMissing from './components/common/ConfigMissing'
import LoginPage from './pages/LoginPage'
import InstalarPage from './pages/InstalarPage'
import UpdatePrompt from './components/pwa/UpdatePrompt'
import DashboardPage from './pages/DashboardPage'
import PastOrdersPage from './pages/PastOrdersPage'
import ResumenPage from './pages/ResumenPage'
import NewOrderPage from './pages/NewOrderPage'
import OrderDetailPage from './pages/OrderDetailPage'
import CalendarPage from './pages/CalendarPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import PendientesPage from './pages/PendientesPage'
import PendienteDetailPage from './pages/PendienteDetailPage'
import UsersPage from './pages/UsersPage'
import RolesPermisosPage from './pages/RolesPermisosPage'
import PedidosTiendaPage from './pages/PedidosTiendaPage'
import NewPedidoTiendaPage from './pages/NewPedidoTiendaPage'
import PedidoTiendaDetailPage from './pages/PedidoTiendaDetailPage'
import CatalogosPage from './pages/CatalogosPage'
import CatalogoClientePage from './pages/CatalogoClientePage'
import InventarioTelaPage from './pages/InventarioTelaPage'
import ConsumosPrendaPage from './pages/ConsumosPrendaPage'
import ControlRapidoPage from './pages/ControlRapidoPage'
import EstadisticasPage from './pages/EstadisticasPage'
import PedidosColegioPage from './pages/PedidosColegioPage'
import FrisaPage from './pages/FrisaPage'
import TallerosPage from './pages/TallerosPage'
import NotasTiendaPage from './pages/NotasTiendaPage'
import TareasPage from './pages/TareasPage'
import ManualesPage from './pages/ManualesPage'
import ManualProcesosPage from './pages/ManualProcesosPage'
import AtrPage from './pages/AtrPage'
import AtrCargaPage from './pages/AtrCargaPage'
import AtrOcNuevaPage from './pages/AtrOcNuevaPage'
import AtrOcDetallePage from './pages/AtrOcDetallePage'
import CrmPage from './pages/CrmPage'
import CotizacionesWebPage from './pages/CotizacionesWebPage'
import CrmEmpresaPage from './pages/CrmEmpresaPage'
import CrmImportarPage from './pages/CrmImportarPage'
import HojasImpresasPage from './pages/HojasImpresasPage'
import EntregaMasivaPage from './pages/EntregaMasivaPage'
import PedidosPage from './pages/PedidosPage'
import PedidoPage from './pages/PedidoPage'
import ProduccionCapturaPage from './pages/ProduccionCapturaPage'
import ProduccionRevisionPage from './pages/ProduccionRevisionPage'
import ProduccionDashboardPage from './pages/ProduccionDashboardPage'
import ProduccionAdminPage from './pages/ProduccionAdminPage'
import ProduccionOperacionesPage from './pages/ProduccionOperacionesPage'
import ImprimirOperacionesPage from './pages/ImprimirOperacionesPage'
import CotizadorPage from './pages/CotizadorPage'
import EstadisticasProduccionPage from './pages/EstadisticasProduccionPage'
import TalleroDetailPage from './pages/TalleroDetailPage'
import InventarioPage from './pages/InventarioPage'
import InventarioTraspasosPage from './pages/InventarioTraspasosPage'
import InventarioMovimientosPage from './pages/InventarioMovimientosPage'
import InventarioConteosPage from './pages/InventarioConteosPage'
import InventarioAdminPage from './pages/InventarioAdminPage'
import InventarioSinClasificarPage from './pages/InventarioSinClasificarPage'
import NewPedidoColegioPage from './pages/NewPedidoColegioPage'
import PedidoColegioDetailPage from './pages/PedidoColegioDetailPage'
import FeatureDisabledPage from './components/common/FeatureDisabledPage'
import DesignSystemPage from './pages/DesignSystemPage'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Loading } from './components/common/States'
import { PEDIDOS_PROVEEDOR_HABILITADO } from './utils/featureFlags'

// Sistema operativo (todo lo que antes vivía en /#/...). Desde la página
// pública (nov-2026) el sistema vive en /app con BrowserRouter + basename, y el
// login en /login. Ver src/lib/rutas.js y main.jsx.
export default function App() {
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    const actualizar = () => setPathname(window.location.pathname)
    window.addEventListener('salper:ruta', actualizar)
    window.addEventListener('popstate', actualizar)
    return () => {
      window.removeEventListener('salper:ruta', actualizar)
      window.removeEventListener('popstate', actualizar)
    }
  }, [])

  // El sistema no se indexa en buscadores (además del X-Robots-Tag de vercel.json).
  useEffect(() => {
    document.title = 'SALPER · Sistema Operativo'
    let meta = document.querySelector('meta[name="robots"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'robots'
      document.head.appendChild(meta)
    }
    meta.content = 'noindex, nofollow'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#16130f')
  }, [])

  if (!isSupabaseConfigured) {
    return <ConfigMissing />
  }

  return (
    <AuthProvider>
      {esRutaLogin(pathname) ? <LoginGate /> : <AuthGate />}
    </AuthProvider>
  )
}

function LoginGate() {
  const { loading } = useAuth()
  if (loading) return <Loading label="Cargando…" />
  return (
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>
  )
}

// Sin sesión, /app/... manda a /login?next=<ruta> y, al entrar, regresa ahí.
function RedirigirALogin() {
  const location = useLocation()
  useEffect(() => {
    const next = BASE_SISTEMA + location.pathname + location.search
    irA('/login?next=' + encodeURIComponent(next))
  }, [location])
  return <Loading label="Cargando…" />
}

// V29 — se quitó el "modo invitado": SALPER es un sistema interno y no
// debe verlo nadie externo a la empresa. Sin sesión no se monta ninguna
// ruta del sistema, ningún dato, ni el nav de AppLayout: se manda a /login
// (salvo /app/instalar). El servidor refuerza esto mismo del lado de la
// base (schema_v29_no_acceso_externo.sql revoca el acceso de `anon` al
// schema `public`), así que aunque alguien se saltara este chequeo del
// cliente, la base no le regresa nada.
function AuthGate() {
  const { loading, user } = useAuth()

  if (loading || estaSaliendo()) return <Loading label="Cargando…" />

  if (!user) {
    return (
      <BrowserRouter basename={BASE_SISTEMA}>
        <Routes>
          <Route path="/instalar" element={<InstalarPage />} />
          <Route path="*" element={<RedirigirALogin />} />
        </Routes>
        <UpdatePrompt />
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter basename={BASE_SISTEMA}>
      <AppLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/pasadas" element={<PastOrdersPage />} />
          <Route path="/resumen" element={<ResumenPage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/instalar" element={<InstalarPage />} />
          <Route path="/nueva" element={<NewOrderPage />} />
          <Route path="/orden/:id" element={<OrderDetailPage />} />
          <Route path="/calendario" element={<CalendarPage />} />
          <Route path="/anuncios" element={<AnnouncementsPage />} />
          <Route path="/pendientes" element={<PendientesPage />} />
          <Route path="/notas-tienda" element={<NotasTiendaPage />} />
          <Route path="/tareas" element={<TareasPage />} />
          {/* V196 — Manuales (todos leen; man.editar edita). */}
          <Route path="/manuales" element={<ManualesPage />} />
          <Route path="/hojas-impresas" element={<HojasImpresasPage />} />
          <Route path="/manuales/seccion/:seccionId" element={<ManualesPage vista="seccion" />} />
          <Route path="/manuales/ver/:manualId" element={<ManualesPage vista="ver" />} />
          <Route path="/manuales/editar/:manualId" element={<ManualesPage vista="editar" />} />
          <Route path="/manuales/nuevo/:seccionId" element={<ManualesPage vista="nuevo" />} />
          {/* Manual de Procesos (todos leen; contenido en src/data/manualesProcesos.js, sin base). */}
          <Route path="/procesos" element={<ManualProcesosPage />} />
          <Route path="/procesos/:id" element={<ManualProcesosPage />} />
          {/* V209 — Inventario de batas de ATR (atr.ver; carga inicial: atr.cargar). */}
          <Route path="/atr" element={<AtrPage />} />
          <Route path="/atr/carga" element={<AtrCargaPage />} />
          {/* V215 — órdenes de compra de ATR (subir: atr.oc). */}
          <Route path="/atr/oc/nueva" element={<AtrOcNuevaPage />} />
          <Route path="/atr/oc/:id" element={<AtrOcDetallePage />} />
          {/* V207 — CRM de prospectos (crm.usar; importar: crm.importar). */}
          <Route path="/crm" element={<CrmPage />} />
          <Route path="/crm/importar" element={<CrmImportarPage />} />
          <Route path="/crm/:id" element={<CrmEmpresaPage />} />
          {/* V213 — cotizaciones del formulario público (admin_general / admin_tienda). */}
          <Route path="/cotizaciones-web" element={<CotizacionesWebPage />} />
          <Route path="/entregas" element={<EntregaMasivaPage />} />
          {/* V176 — pedidos: varias órdenes con un anticipo, abonos y factura. */}
          <Route path="/pedidos" element={<PedidosPage />} />
          <Route path="/pedido/:id" element={<PedidoPage />} />
          <Route path="/pendientes/:id" element={<PendienteDetailPage />} />
          <Route path="/usuarios" element={<UsersPage />} />
          <Route path="/roles-permisos" element={<RolesPermisosPage />} />
          {/* V117 — Parte 0 del rediseño visual (branch rediseno-visual):
              página de muestra de tokens/componentes, solo admin_general
              (ver canViewDesignSystem). */}
          <Route path="/design" element={<DesignSystemPage />} />
          <Route path="/catalogos" element={<CatalogosPage />} />
          <Route path="/catalogos/cliente/:clienteId" element={<CatalogoClientePage />} />
          <Route path="/inventario-tela" element={<InventarioTelaPage />} />
          <Route path="/consumos-prenda" element={<ConsumosPrendaPage />} />
          <Route path="/control-rapido" element={<ControlRapidoPage />} />
          <Route path="/estadisticas" element={<EstadisticasPage />} />
          {/* V57 — Pedidos Colegio (beta): cada página se protege sola con
              RequireRole (solo admin_general); el servidor lo exige igual. */}
          <Route path="/produccion/captura" element={<ProduccionCapturaPage />} />
          <Route path="/produccion/revision" element={<ProduccionRevisionPage />} />
          <Route path="/produccion/dashboard" element={<ProduccionDashboardPage />} />
          <Route path="/produccion/admin" element={<ProduccionAdminPage />} />
          <Route path="/produccion/operaciones" element={<ProduccionOperacionesPage />} />
          <Route path="/produccion/operaciones/imprimir" element={<ImprimirOperacionesPage />} />
          <Route path="/cotizador" element={<CotizadorPage />} />
          <Route path="/estadisticas-produccion" element={<EstadisticasProduccionPage />} />
          <Route path="/talleros" element={<TallerosPage />} />
          <Route path="/talleros/:id" element={<TalleroDetailPage />} />
          {/* V89 — Inventario (beta, oculto en el menú salvo para tu cuenta —
              ver RequireInventarioAccess). */}
          <Route path="/inventario" element={<InventarioPage />} />
          <Route path="/inventario/traspasos" element={<InventarioTraspasosPage />} />
          <Route path="/inventario/movimientos" element={<InventarioMovimientosPage />} />
          <Route path="/inventario/conteos" element={<InventarioConteosPage />} />
          <Route path="/inventario/admin" element={<InventarioAdminPage />} />
          {/* V121 — clasificar en modelos los artículos que ya existían. */}
          <Route path="/inventario/sin-clasificar" element={<InventarioSinClasificarPage />} />
          {/* V180 — Frisa a consignación (prueba, solo admin_general). V184 — + Niveles de inventario (todos). */}
          <Route path="/frisa" element={<FrisaPage />} />
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
      <UpdatePrompt />
    </BrowserRouter>
  )
}
