import { useState } from 'react'
import { uploadFotoBordado } from '../../services/bordadosService'
import { bordadosDePrenda, textoUbicaciones } from '../../utils/productoCatalogo'

// V133 — bordados de una prenda que "lleva bordado" (escolar/industrial):
// cada uno con su foto y dónde va. Viven dentro de la prenda
// (items[].bordados[] = { id, ubicacion, foto_url, foto_path }, la misma forma
// que usan las órdenes de tipo bordado), así tienda los captura al crear la
// orden. Si la prenda viene del catálogo llegan ya llenos (con la foto del
// logotipo, si el producto la tiene) y aquí se pueden cambiar sin tocar el
// catálogo. `bordado_ubicacion` (V131) se mantiene al día con las ubicaciones,
// para las pantallas que todavía leen ese texto.
//
// `onPatch(fn)` recibe una función prenda → cambios, porque las fotos se suben
// en segundo plano y la prenda pudo cambiar mientras tanto.
export default function BordadosPrenda({ item, onPatch }) {
  const [subiendo, setSubiendo] = useState(0)
  const [error, setError] = useState(null)
  const lista = bordadosDePrenda(item)

  const guardar = (fn) =>
    onPatch((prenda) => {
      const bordados = fn(bordadosDePrenda(prenda))
      return { bordados, bordado_ubicacion: textoUbicaciones(bordados) }
    })

  async function subir(file) {
    setError(null)
    setSubiendo((n) => n + 1)
    const { data, error: upErr } = await uploadFotoBordado(file)
    setSubiendo((n) => n - 1)
    if (upErr) setError(upErr)
    return data
  }

  async function agregarFotos(fileList) {
    for (const file of [...(fileList || [])]) {
      const foto = await subir(file)
      if (foto) guardar((b) => [...b, { id: crypto.randomUUID(), ubicacion: '', foto_url: foto.url, foto_path: foto.path }])
    }
  }

  async function ponerFoto(id, file) {
    if (!file) return
    const foto = await subir(file)
    if (foto) guardar((b) => b.map((x) => (x.id === id ? { ...x, foto_url: foto.url, foto_path: foto.path } : x)))
  }

  return (
    <div className="bordados-prenda">
      <span className="field-label">Bordados (foto y dónde va cada uno)</span>
      {lista.map((b) => (
        <div key={b.id} className="producto-bordado">
          {b.foto_url ? (
            <a href={b.foto_url} target="_blank" rel="noreferrer" className="producto-fotos__item">
              <img src={b.foto_url} alt="Bordado" />
            </a>
          ) : (
            <label className="producto-fotos__agregar producto-fotos__agregar--falta">
              + Foto
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  ponerFoto(b.id, e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
          )}
          <input
            type="text"
            className="input"
            value={b.ubicacion}
            onChange={(e) => guardar((l) => l.map((x) => (x.id === b.id ? { ...x, ubicacion: e.target.value } : x)))}
            placeholder="¿Dónde va? Ej. Espalda, manga derecha, pecho izquierdo"
            aria-label="Dónde va el bordado"
          />
          <button type="button" className="sizes-row__remove" onClick={() => guardar((l) => l.filter((x) => x.id !== b.id))} aria-label="Quitar bordado">
            ×
          </button>
        </div>
      ))}
      <label className="btn btn--secondary btn--small bordados-prenda__subir">
        {subiendo > 0 ? 'Subiendo…' : lista.length > 0 ? '+ Agregar otro bordado (foto)' : '+ Agregar foto del bordado'}
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            agregarFotos(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}
