// V132 — miniaturas de los bordados capturados dentro de la prenda
// (items[].bordados[]: foto + dónde va). Tocar una la abre en grande.
export default function BordadosMiniaturas({ bordados = [] }) {
  const lista = (bordados || []).filter((b) => b.foto_url || b.ubicacion)
  if (lista.length === 0) return null
  return (
    <div className="bordado-miniaturas">
      {lista.map((b, i) => (
        <a key={b.id || i} href={b.foto_url || undefined} target="_blank" rel="noreferrer" className="bordado-miniaturas__item">
          {b.foto_url ? <img src={b.foto_url} alt={b.ubicacion || 'Bordado'} loading="lazy" /> : <span className="pantone-hint">Sin foto</span>}
          {b.ubicacion && <span className="bordado-miniaturas__lugar">{b.ubicacion}</span>}
        </a>
      ))}
    </div>
  )
}
