// Fase 1A — "Venta de mostrador" para TODA la orden (antes era por talla).
// Si está activo no se pide precio unitario, anticipo ni factura, y la orden
// se puede entregar sin ellos. En la base se sigue guardando por línea
// (todas las líneas de la orden quedan como de mostrador).
export default function VentaMostradorToggle({ checked, onChange, disabled = false, nota = null }) {
  return (
    <label className={'mostrador-toggle' + (checked ? ' mostrador-toggle--on' : '')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="mostrador-toggle__switch" aria-hidden="true" />
      <span className="mostrador-toggle__texto">
        <b>Venta de mostrador</b>
        <span>{nota || (checked ? 'Toda la orden: sin precio, anticipo ni factura.' : 'Actívalo si toda la orden es de mostrador.')}</span>
      </span>
    </label>
  )
}
