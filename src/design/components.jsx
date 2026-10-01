// V117 — Componentes base del rediseño visual (Parte 0, branch
// rediseno-visual). Viven aparte de src/components/ a propósito: hasta que
// el usuario apruebe /design, nada de esto se usa en la app real — cuando
// se apruebe, la Parte 1 de este rediseño los mueve/integra donde
// corresponda (Dashboard, detalle de orden, etc.), reemplazando a
// OrderCard.jsx, StatusBadge.jsx, etc. actuales.
//
// Todo asume que el padre ya está envuelto en `.design-root` (la clase que
// trae los tokens — ver src/styles/design-system.css).

// Etapa → chip, tabla de la Parte 0. "Completado" usa el chip verde sólido
// (--ds-chip--completado), el resto son los 9 colores con nombre.
const ETAPA_CHIP = {
  en_confirmacion: { label: 'En confirmación', cls: 'ds-chip--neutral' },
  diseno: { label: 'Diseño', cls: 'ds-chip--neutral' },
  confirmado: { label: 'Confirmado', cls: 'ds-chip--neutral-outline' },
  impresion: { label: 'Impresión', cls: 'ds-chip--teal' },
  sublimado: { label: 'Sublimado', cls: 'ds-chip--pink' },
  corte: { label: 'Corte', cls: 'ds-chip--blue' },
  bordado: { label: 'Bordado', cls: 'ds-chip--indigo' },
  costura: { label: 'Costura', cls: 'ds-chip--purple' },
  terminado: { label: 'Terminado', cls: 'ds-chip--green' },
  completado: { label: 'Completado', cls: 'ds-chip--completado' },
}

export function EtapaChip({ etapa }) {
  const cfg = ETAPA_CHIP[etapa] || { label: etapa, cls: 'ds-chip--neutral' }
  return <span className={`ds-chip ${cfg.cls}`}>{cfg.label}</span>
}

// Urgencia de entrega: ≤3 días rojo, ≤7 amarillo, resto neutral con fecha.
export function UrgenciaChip({ dias, fechaCorta }) {
  if (dias <= 3) return <span className="ds-chip ds-chip--red">{dias} días</span>
  if (dias <= 7) return <span className="ds-chip ds-chip--yellow">{dias} días</span>
  return <span className="ds-chip ds-chip--neutral">{fechaCorta}</span>
}

export function Chip({ color = 'neutral', children }) {
  return <span className={`ds-chip ds-chip--${color}`}>{children}</span>
}

export function AppBar({ titulo, subtitulo, soloLectura }) {
  return (
    <div className="ds-appbar">
      <div>
        <p className="ds-appbar__title">{titulo}</p>
        <p className="ds-appbar__subtitle">{subtitulo}</p>
      </div>
      {soloLectura && <span className="ds-appbar__readonly">Solo lectura</span>}
    </div>
  )
}

export function SearchBar({ placeholder = 'Buscar folio o cliente' }) {
  return <div className="ds-searchbar">{placeholder}</div>
}

// etapas: hasta 2 chips visibles + "+N" si hay más (etapas paralelas).
export function OrderRow({ folio, cliente, urgencia, etapas }) {
  const visibles = etapas.slice(0, 2)
  const resto = etapas.length - visibles.length
  return (
    <div className="ds-order-row">
      <div>
        <div className="ds-order-row__folio">{folio}</div>
        <div className="ds-order-row__sub">
          {cliente} · {urgencia}
        </div>
      </div>
      <div className="ds-order-row__chips">
        {visibles.map((e) => (
          <EtapaChip key={e} etapa={e} />
        ))}
        {resto > 0 && <Chip color="neutral">+{resto}</Chip>}
      </div>
    </div>
  )
}

export function OrderCard({ folio, cliente, tipo, prendas, urgencia, etapa, acciones }) {
  return (
    <div className="ds-order-card">
      <div className="ds-order-card__top">
        <span className="ds-order-card__folio">{folio}</span>
        <EtapaChip etapa={etapa} />
      </div>
      <h4 className="ds-order-card__client">{cliente}</h4>
      <p className="ds-order-card__meta">
        {tipo} · {prendas} prenda{prendas === 1 ? '' : 's'} · {urgencia}
      </p>
      {acciones && <div className="ds-order-card__actions">{acciones}</div>}
    </div>
  )
}

export function Tabs({ tabs, activo }) {
  return (
    <div className="ds-tabs">
      {tabs.map((t) => (
        <button key={t.key} type="button" className={'ds-tab' + (t.key === activo ? ' ds-tab--active' : '')}>
          {t.label}
          {t.count != null && <span className="ds-tab__badge">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Button({ variant = 'primary', disabled, children, ...props }) {
  const cls = disabled ? 'ds-btn--disabled' : `ds-btn--${variant}`
  return (
    <button type="button" className={`ds-btn ${cls}`} disabled={disabled} {...props}>
      {disabled && '🔒 '}
      {children}
    </button>
  )
}

export function KpiTile({ value, label }) {
  return (
    <div className="ds-kpi">
      <div className="ds-kpi__value">{value}</div>
      <div className="ds-kpi__label">{label}</div>
    </div>
  )
}

export function FormField({ label, placeholder, mono }) {
  return (
    <label className="ds-field">
      <span className="ds-field__label">{label}</span>
      <input className="ds-field__input" style={mono ? { fontFamily: 'var(--ds-font-mono)' } : undefined} placeholder={placeholder} readOnly />
    </label>
  )
}

export function BottomNav({ items, activo }) {
  return (
    <div className="ds-bottomnav">
      {items.map((it) => (
        <div key={it.key} className={'ds-bottomnav__item' + (it.key === activo ? ' ds-bottomnav__item--active' : '')}>
          <span className="ds-bottomnav__icon">{it.icon}</span>
          {it.label}
        </div>
      ))}
    </div>
  )
}
