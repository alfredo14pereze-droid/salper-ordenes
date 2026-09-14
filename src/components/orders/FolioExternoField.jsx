// Folio externo (control anterior) — V37: antes era un input de texto
// libre (el usuario tenía que escribir "ORD-0001" completo); ahora el
// "ORD" es fijo y no editable, y aquí solo se captura los 4 dígitos —
// se arma el folio completo (p.ej. "ORD0007") al vuelo, sin separador
// (así se guardó desde V32: "ORD" + 4 números, sin guion).
//
// `value` es el folio COMPLETO tal como se guarda en la base
// (ej. "ORD0007" o "" si no tiene) — mismo contrato que el input de
// texto libre que reemplaza, así que no hay que tocar nada más en el
// formulario que lo usa. `onChange` recibe también el folio completo.
function onlyDigits(value) {
  return (value || '').replace(/\D/g, '').slice(0, 4)
}

// Por si un folio viejo trae minúsculas o un formato distinto — se le
// quita cualquier prefijo de letras al mostrar, y se le vuelve a poner
// "ORD" en mayúsculas al guardar.
function digitsFromFullValue(value) {
  return onlyDigits((value || '').replace(/^[A-Za-z]+/, ''))
}

export default function FolioExternoField({ value, onChange, id }) {
  const digits = digitsFromFullValue(value)

  function handleChange(e) {
    const newDigits = onlyDigits(e.target.value)
    onChange(newDigits ? `ORD${newDigits}` : '')
  }

  return (
    <div className="input-group">
      <span className="input-group__prefix">ORD</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        className="input input-group__input"
        value={digits}
        onChange={handleChange}
        placeholder="0001"
      />
    </div>
  )
}
