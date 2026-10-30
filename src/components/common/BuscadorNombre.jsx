// Caja de búsqueda por nombre para las listas de catálogos.
export default function BuscadorNombre({ value, onChange, placeholder, autoFocus = false }) {
  return (
    <input
      type="search"
      className="input buscador-nombre"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      autoFocus={autoFocus}
    />
  )
}
