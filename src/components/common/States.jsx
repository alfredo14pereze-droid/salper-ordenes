// Estados comunes de carga/error/vacío, reutilizados en dashboard, detalle
// y calendario para no repetir el mismo JSX en cada página.

export function Loading({ label = 'Cargando…' }) {
  return <div className="state-message state-message--loading">{label}</div>
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state-message state-message--error">
      <p>Ocurrió un problema: {error?.message || 'Error desconocido.'}</p>
      {onRetry && (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  )
}

export function EmptyState({ children }) {
  return <div className="state-message state-message--empty">{children}</div>
}
