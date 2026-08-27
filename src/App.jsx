import { HashRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ConfigMissing from './components/common/ConfigMissing'
import DashboardPage from './pages/DashboardPage'
import NewOrderPage from './pages/NewOrderPage'
import OrderDetailPage from './pages/OrderDetailPage'
import CalendarPage from './pages/CalendarPage'
import { isSupabaseConfigured } from './lib/supabaseClient'

// HashRouter (en vez de BrowserRouter) para que las rutas funcionen igual
// en Vercel y en GitHub Pages sin configuración extra de reescritura de URLs.
export default function App() {
  if (!isSupabaseConfigured) {
    return <ConfigMissing />
  }

  return (
    <HashRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/nueva" element={<NewOrderPage />} />
          <Route path="/orden/:id" element={<OrderDetailPage />} />
          <Route path="/calendario" element={<CalendarPage />} />
        </Routes>
      </AppLayout>
    </HashRouter>
  )
}
