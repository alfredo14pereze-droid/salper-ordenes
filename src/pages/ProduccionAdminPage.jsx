import { useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { canViewProduccionMontos } from '../utils/permissions'
import OperacionesAdmin from '../components/produccion/OperacionesAdmin'
import OperadorasAdmin from '../components/produccion/OperadorasAdmin'
import ReglasAdmin from '../components/produccion/ReglasAdmin'
import ConfigAdmin from '../components/produccion/ConfigAdmin'

// V70 — Administración de producción (admin_general / admin_fabrica).
export default function ProduccionAdminPage() {
  return (
    <RequireRole allow={canViewProduccionMontos}>
      <Admin />
    </RequireRole>
  )
}

const TABS = [
  { key: 'operaciones', label: 'Operaciones' },
  { key: 'operadoras', label: 'Operadoras' },
  { key: 'reglas', label: 'Reglas de premios' },
  { key: 'config', label: 'Configuración' },
]

function Admin() {
  const [tab, setTab] = useState('operaciones')
  return (
    <div className="page">
      <h2 className="section-title">Administración de producción</h2>
      <p className="form-hint produccion__aviso">
        Cambiar un tiempo o un precio <b>no modifica semanas ya capturadas</b> (cada registro guarda el tiempo y el precio con que se capturó).
      </p>
      <div className="produccion__tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" className={'produccion__tab' + (tab === t.key ? ' produccion__tab--activa' : '')} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'operaciones' && <OperacionesAdmin />}
      {tab === 'operadoras' && <OperadorasAdmin />}
      {tab === 'reglas' && <ReglasAdmin />}
      {tab === 'config' && <ConfigAdmin />}
    </div>
  )
}
