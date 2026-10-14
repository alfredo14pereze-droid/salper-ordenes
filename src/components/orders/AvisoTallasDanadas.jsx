// V152 — aviso de que la orden perdió tallas (el error de V151: guardar lo
// surtido borraba tallas). No se puede saber cuáles eran: hay que volver a
// capturarlas editando las prendas, con la orden en papel o el PDF.
export default function AvisoTallasDanadas({ order, paraEstacion = false }) {
  const n = order?.tallas_danadas || 0
  if (n === 0) return null
  return (
    <p className="form-error aviso-tallas-danadas" role="alert">
      ⚠️ A esta orden se le borraron {n} talla{n === 1 ? '' : 's'} por un error del sistema (ya corregido).
      {paraEstacion
        ? ' Las cantidades de abajo están incompletas: avisa a ventas antes de terminarla.'
        : ' Hay que volver a capturarlas: edita las prendas con la orden en papel o el PDF de confirmación.'}
    </p>
  )
}
