import { useState } from 'react'
import Modal from '../talleros/Modal'
import { NombreFrisa } from './comunes'
import PdfPreviewModal from '../pdf/PdfPreviewModal'
import { ESTADOS, aPedirCSV, listaAPedir } from '../../utils/frisaNiveles'
import { buildFrisaAPedirPdfBlob, frisaAPedirFileName } from '../../utils/generateFrisaAPedirPdf'

const num = (n) => Number(n || 0).toLocaleString('es-MX')

// Lista A PEDIR (CRÍTICO + PEDIR): vista previa, CSV o PDF (con vista previa).
export default function FrisaNivelesExportar({ filas, cfg, onClose }) {
  const lista = listaAPedir(filas)
  const piezas = lista.reduce((t, f) => t + (f.niveles.aPedir || 0), 0)
  const [blob, setBlob] = useState(null)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState(null)

  function bajarCSV() {
    const url = URL.createObjectURL(new Blob([aPedirCSV(filas)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = frisaAPedirFileName('csv')
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function verPDF() {
    setGenerando(true)
    setError(null)
    try {
      setBlob(await buildFrisaAPedirPdfBlob(filas, cfg))
    } catch (e) {
      setError(e.message || 'No se pudo generar el PDF.')
    }
    setGenerando(false)
  }

  return (
    <>
      <Modal title="Lista A PEDIR" onClose={onClose}>
        <p className="frisa__nota">
          {lista.length} claves en CRÍTICO o PEDIR · <strong>{num(piezas)} piezas</strong> para llegar al máximo.
        </p>
        {lista.length > 0 && (
          <div className="revision__tabla-wrap frisa-niveles__dif">
            <table className="simple-table frisa-tabla">
              <thead><tr><th>Clave</th><th className="num">Disponible</th><th>Estado</th><th className="num">A PEDIR</th></tr></thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id}>
                    <td><strong>{f.clave}</strong><NombreFrisa producto={f} /></td>
                    <td className="num">{num(f.disponible ?? f.stock_actual)}</td>
                    <td>{ESTADOS[f.niveles.estado].label}</td>
                    <td className="num"><strong>{num(f.niveles.aPedir)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="frisa__botones">
          <button type="button" className="btn btn--primary" disabled={!lista.length || generando} onClick={verPDF}>
            {generando ? 'Generando…' : 'Ver PDF'}
          </button>
          <button type="button" className="btn btn--secondary" disabled={!lista.length} onClick={bajarCSV}>Descargar CSV</button>
        </div>
      </Modal>
      {blob && <PdfPreviewModal blob={blob} fileName={frisaAPedirFileName('pdf')} onClose={() => setBlob(null)} />}
    </>
  )
}
