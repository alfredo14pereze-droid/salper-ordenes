import { ESTADOS_USO } from '../../services/tallerosService'

// Disponible = verde (bien), Prestado = naranja, En reparación = rojo suave.
export default function TalleroEstadoBadge({ estado }) {
  const label = ESTADOS_USO.find((e) => e.key === estado)?.label || estado
  return <span className={`badge tallero-badge tallero-badge--${estado}`}>{label}</span>
}
