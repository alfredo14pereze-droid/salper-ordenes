// Placeholder visual para funciones ya contempladas en el modelo de datos
// pero todavía no implementadas en la UI (fotos de referencia, link
// compartible, notificaciones). Así queda claro para cualquiera que use
// la app que "está preparado" y no es un olvido.
export default function ComingSoonCard({ title, description }) {
  return (
    <div className="coming-soon-card">
      <span className="coming-soon-card__badge">Próximamente</span>
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
  )
}
