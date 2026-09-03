import { STATUS_GROUPS } from '../../lib/constants'

// `statuses` es opcional — el Dashboard manda los grupos sin "completado"
// (esas órdenes viven en Órdenes pasadas, filtrar por ese grupo ahí
// siempre daría cero resultados). Cada chip es un GRUPO (ej. "Cortado" =
// en_corte + cortado, ver STATUS_GROUPS) — así no hay que elegir entre
// "entrando" y "ya terminada" para encontrar una orden, con un chip
// alcanza. `filters.statuses` guarda las keys de grupo (order.status se
// compara con matchesStatusGroups, ver utils/status.js).
export default function OrderFilters({ orderTypes, filters, onChange, statuses = STATUS_GROUPS }) {
  function toggleValue(field, value) {
    const current = filters[field]
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    onChange({ ...filters, [field]: next })
  }

  return (
    <div className="order-filters">
      <div className="order-filters__group">
        <span className="order-filters__label">Tipo</span>
        <div className="order-filters__chips">
          {orderTypes.map((type) => (
            <button
              key={type.key}
              type="button"
              className={'chip' + (filters.types.includes(type.key) ? ' chip--active' : '')}
              onClick={() => toggleValue('types', type.key)}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className="order-filters__group">
        <span className="order-filters__label">Estado</span>
        <div className="order-filters__chips">
          {statuses.map((status) => (
            <button
              key={status.key}
              type="button"
              className={'chip' + (filters.statuses.includes(status.key) ? ' chip--active' : '')}
              onClick={() => toggleValue('statuses', status.key)}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      <div className="order-filters__group">
        <span className="order-filters__label">Buscar</span>
        <input
          type="text"
          className="input"
          placeholder="Número de orden o cliente…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>

      {(filters.types.length > 0 || filters.statuses.length > 0 || filters.search) && (
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => onChange({ types: [], statuses: [], search: '' })}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}
