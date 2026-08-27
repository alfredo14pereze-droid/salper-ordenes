import { STATUSES } from '../../lib/constants'

export default function OrderFilters({ orderTypes, filters, onChange }) {
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
              style={{ '--chip-color': type.color }}
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
          {STATUSES.map((status) => (
            <button
              key={status.key}
              type="button"
              className={'chip' + (filters.statuses.includes(status.key) ? ' chip--active' : '')}
              style={{ '--chip-color': status.color }}
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
