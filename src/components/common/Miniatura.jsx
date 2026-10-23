import { esPdf } from '../../utils/archivos'

// Una foto, o una tarjeta "PDF" del mismo tamaño si el archivo es un PDF
// (un PDF no se puede pintar con <img>). `pdf` fuerza el caso cuando la url
// no trae extensión (p. ej. un archivo local antes de subirlo).
export default function Miniatura({ src, alt = '', pdf, className, style, ...props }) {
  if (pdf ?? esPdf(src)) {
    return (
      <span className={'miniatura-pdf' + (className ? ` ${className}` : '')} style={style} title={alt || 'PDF'}>
        <span className="miniatura-pdf__icono" aria-hidden="true">📄</span>
        <span className="miniatura-pdf__texto">PDF</span>
      </span>
    )
  }
  return <img src={src} alt={alt} className={className} style={style} {...props} />
}
