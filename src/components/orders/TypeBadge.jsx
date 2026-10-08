// Todos los tipos de orden se ven igual (naranja suave) — es un detalle
// de identidad, no un código de color por tipo. Ver la regla de colores
// en styles/index.css: el naranja se usa poco y de forma consistente.
// V143 — única excepción: Maquila (trabajo para un cliente externo) va en
// negro con amarillo, para no confundirla con la producción propia.
export default function TypeBadge({ type }) {
  const label = type?.label || 'Sin tipo'
  return <span className={type?.key === 'maquila' ? 'badge badge--maquila' : 'badge badge--outline'}>{label}</span>
}
