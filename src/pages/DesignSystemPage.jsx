import RequireRole from '../components/common/RequireRole'
import { canViewDesignSystem } from '../utils/permissions'
import { AppBar, SearchBar, OrderRow, OrderCard, Tabs, Button, KpiTile, FormField, BottomNav, Chip, EtapaChip, UrgenciaChip } from '../design/components'

// V117 — Parte 0 del rediseño visual (branch rediseno-visual): página de
// muestra con todos los tokens/componentes nuevos, para que el usuario dé
// su visto bueno ANTES de aplicar esto al resto de la app (regla explícita
// del propio documento de rediseño). Nada fuera de esta página usa estos
// estilos todavía.
//
// El documento original pedía "visible solo para super_admin" — ese rol no
// existe en SALPER (ver ROLE_LABELS en utils/permissions.js); se usa
// admin_general, que es el rol equivalente más cercano (acceso total).
export default function DesignSystemPage() {
  return (
    <RequireRole allow={canViewDesignSystem}>
      <DesignSystemContent />
    </RequireRole>
  )
}

const CHIPS = [
  ['red', '#fee2e2', '#b91c1c'],
  ['yellow', '#fef3c7', '#a16207'],
  ['green', '#dcfce7', '#15803d'],
  ['blue', '#dbeafe', '#1d4ed8'],
  ['purple', '#ede9fe', '#6d28d9'],
  ['indigo', '#e0e7ff', '#4338ca'],
  ['teal', '#ccfbf1', '#0f766e'],
  ['pink', '#fce7f3', '#be185d'],
  ['neutral', '#eceef1', '#4b535d'],
]

const COLORES_BASE = [
  ['Fondo de la app', '#f3f4f6'],
  ['Superficie (cards)', '#ffffff'],
  ['Texto principal', '#1c2127'],
  ['Texto secundario', '#6b7480'],
  ['Bordes (inputs)', '#c9ced4'],
  ['Divisores', '#e3e6ea'],
  ['Header / barra superior', '#1c2127'],
  ['Acento', '#e8762c'],
  ['Botón primario', '#1c2127'],
]

const ETAPAS_ORDEN = ['en_confirmacion', 'confirmado', 'impresion', 'sublimado', 'corte', 'bordado', 'costura', 'terminado', 'completado']

function DesignSystemContent() {
  return (
    <div className="design-root" style={{ padding: 24, minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>Sistema de diseño — SALPER</h1>
      <p style={{ color: 'var(--ds-text-muted)', margin: '0 0 32px', fontSize: 14 }}>
        Parte 0 del rediseño visual. Esta página es la única que ya usa los tokens/componentes nuevos — el resto de la
        app sigue exactamente igual hasta que se apruebe esto.
      </p>

      <section className="ds-section">
        <h2 className="ds-section__title">Tipografía</h2>
        <div className="ds-row" style={{ alignItems: 'baseline', gap: 20 }}>
          <span style={{ fontFamily: 'var(--ds-font-sans)', fontWeight: 400, fontSize: 20 }}>Inter 400</span>
          <span style={{ fontFamily: 'var(--ds-font-sans)', fontWeight: 500, fontSize: 20 }}>Inter 500</span>
          <span style={{ fontFamily: 'var(--ds-font-sans)', fontWeight: 600, fontSize: 20 }}>Inter 600</span>
          <span style={{ fontFamily: 'var(--ds-font-sans)', fontWeight: 700, fontSize: 20 }}>Inter 700</span>
          <span style={{ fontFamily: 'var(--ds-font-sans)', fontWeight: 800, fontSize: 20 }}>Inter 800</span>
          <span style={{ fontFamily: 'var(--ds-font-mono)', fontWeight: 700, fontSize: 20 }}>JetBrains Mono — ESC-0042</span>
        </div>
      </section>

      <section className="ds-section">
        <h2 className="ds-section__title">Colores base</h2>
        <div className="ds-swatch-grid">
          {COLORES_BASE.map(([label, color]) => (
            <div key={label} className="ds-swatch">
              <div className="ds-swatch__color" style={{ background: color }} />
              <div className="ds-swatch__label">
                <b>{label}</b>
                <span>{color}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="ds-section">
        <h2 className="ds-section__title">Chips (9 colores con nombre)</h2>
        <div className="ds-row" style={{ marginBottom: 16 }}>
          {CHIPS.map(([name]) => (
            <Chip key={name} color={name}>
              {name}
            </Chip>
          ))}
          <Chip color="neutral-outline">neutral-outline</Chip>
          <Chip color="completado">completado</Chip>
        </div>

        <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--ds-text-muted)', margin: '0 0 8px' }}>Etapa → chip</h3>
        <div className="ds-row" style={{ marginBottom: 16 }}>
          {ETAPAS_ORDEN.map((e) => (
            <EtapaChip key={e} etapa={e} />
          ))}
        </div>

        <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--ds-text-muted)', margin: '0 0 8px' }}>
          Urgencia de entrega (misma regla que ya existe)
        </h3>
        <div className="ds-row">
          <UrgenciaChip dias={1} fechaCorta="1 oct" />
          <UrgenciaChip dias={3} fechaCorta="3 oct" />
          <UrgenciaChip dias={6} fechaCorta="6 oct" />
          <UrgenciaChip dias={15} fechaCorta="15 oct" />
        </div>
      </section>

      <section className="ds-section">
        <h2 className="ds-section__title">Botones</h2>
        <div className="ds-row">
          <Button variant="primary">Guardar</Button>
          <Button variant="accent">Terminar</Button>
          <Button variant="accent">Confirmar</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button disabled>Sin permiso</Button>
        </div>
      </section>

      <section className="ds-section">
        <h2 className="ds-section__title">KPI tile</h2>
        <div className="ds-row">
          <KpiTile value="42" label="Órdenes activas" />
          <KpiTile value="7" label="Atrasadas" />
          <KpiTile value="93%" label="A tiempo" />
        </div>
      </section>

      <section className="ds-section">
        <h2 className="ds-section__title">Campo de formulario</h2>
        <div className="ds-row">
          <FormField label="Cliente" placeholder="Nombre del cliente" />
          <FormField label="Folio" placeholder="ESC-0042" mono />
        </div>
      </section>

      <section className="ds-section">
        <h2 className="ds-section__title">Tabs</h2>
        <Tabs
          activo="por-entregar"
          tabs={[
            { key: 'camino', label: 'En camino a fábrica', count: 0 },
            { key: 'fabrica', label: 'En fábrica', count: 0 },
            { key: 'regreso', label: 'De regreso', count: 2 },
            { key: 'por-entregar', label: 'Por entregar', count: 2 },
            { key: 'cerrados', label: 'Cerrados', count: 1 },
          ]}
        />
      </section>

      <section className="ds-section">
        <h2 className="ds-section__title">SearchBar</h2>
        <div style={{ maxWidth: 320 }}>
          <SearchBar />
        </div>
      </section>

      <section className="ds-section">
        <h2 className="ds-section__title">OrderRow (lista de órdenes)</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
          <OrderRow folio="ESC-0042" cliente="Colegio Echavarría" urgencia="2 días" etapas={['costura']} />
          <OrderRow folio="IND-0017" cliente="Cimaco" urgencia="24 oct" etapas={['corte', 'bordado', 'sublimado']} />
          <OrderRow folio="VEN-0003" cliente="Venta Mostrador" urgencia="6 días" etapas={['completado']} />
        </div>
      </section>

      <section className="ds-section">
        <h2 className="ds-section__title">OrderCard (colas de operadores)</h2>
        <div className="ds-row">
          <OrderCard
            folio="ESC-0042"
            cliente="Colegio Echavarría"
            tipo="Escolar"
            prendas={3}
            urgencia="2 días"
            etapa="costura"
            acciones={
              <>
                <Button variant="accent">Terminar</Button>
                <Button variant="ghost">Detalle</Button>
              </>
            }
          />
        </div>
      </section>

      <section className="ds-section">
        <h2 className="ds-section__title">AppBar + BottomNav (preview de celular)</h2>
        <div className="ds-phone-mock">
          <AppBar titulo="Órdenes" subtitulo="Juanis · Captura" />
          <div className="ds-phone-mock__body">
            <SearchBar />
            <OrderRow folio="ESC-0042" cliente="Colegio Echavarría" urgencia="2 días" etapas={['costura']} />
            <OrderRow folio="IND-0017" cliente="Cimaco" urgencia="24 oct" etapas={['corte']} />
          </div>
          <BottomNav
            activo="ordenes"
            items={[
              { key: 'ordenes', icon: '📋', label: 'Órdenes' },
              { key: 'pendientes', icon: '🔁', label: 'Pendientes' },
              { key: 'mas', icon: '⋯', label: 'Más' },
            ]}
          />
        </div>
        <p style={{ fontSize: 12, color: 'var(--ds-text-muted)', maxWidth: 480, marginTop: 10 }}>
          Mismo AppBar con badge <Chip color="yellow">Solo lectura</Chip> para roles de solo lectura (consulta_tienda,
          lectura, admin_fabrica_lectura).
        </p>
        <div className="ds-phone-mock" style={{ marginTop: 16 }}>
          <AppBar titulo="Pedidos Colegio" subtitulo="Tío · Consulta" soloLectura />
        </div>
      </section>
    </div>
  )
}
