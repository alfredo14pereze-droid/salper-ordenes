// Convierte "Bordado industrial" -> "bordado_industrial".
// Se usa para generar la "key" interna de un tipo de orden nuevo que el
// usuario crea desde el formulario de "Nueva orden".
export function slugify(text) {
  const normalized = text.toString().normalize('NFD')

  // Quita los diacríticos (acentos) que quedaron como caracteres combinados
  // sueltos tras el normalize('NFD'), sin depender de escribir un rango
  // unicode literal en el código fuente (U+0300 a U+036F = "combining
  // diacritical marks").
  let withoutAccents = ''
  for (const char of normalized) {
    const code = char.codePointAt(0)
    const isCombiningMark = code >= 0x0300 && code <= 0x036f
    if (!isCombiningMark) withoutAccents += char
  }

  return withoutAccents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
