import { supabase } from '../lib/supabaseClient'
import { fetchFrisaNiveles } from './frisaNivelesService'

// V189 — Inventario en plantas de Frisa. Lectura con fp.ver; subir con frisa_pl_importar (fp.importar).
const sinCliente = () => ({ data: null, error: new Error('Supabase no está configurado (revisa tu archivo .env).') })

// Trae todos los renglones de a 1,000 (el límite de cada consulta).
async function todas(nombre, columnas, ordenes) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    let q = supabase.from(nombre).select(columnas)
    for (const o of ordenes) q = q.order(o, { ascending: true })
    const { data, error } = await q.range(desde, desde + 999)
    if (error) return { data: null, error }
    out.push(...data)
    if (data.length < 1000) return { data: out, error: null }
  }
}

export async function fetchPlantasTodo() {
  if (!supabase) return sinCliente()
  const [niv, pl, mov, fol, imp] = await Promise.all([
    fetchFrisaNiveles(),
    supabase.from('frisa_pl_plantas').select('*').order('orden'),
    todas('frisa_pl_movimientos', 'id,planta_id,producto_id,clave,tipo,cantidad,folio,fecha,orden_compra,importacion_id', ['id']),
    todas('frisa_pl_folios', 'tipo,folio', ['tipo', 'folio']),
    supabase.from('frisa_pl_importaciones').select('*').order('creado_en', { ascending: false }).limit(50),
  ])
  const error = niv.error || pl.error || mov.error || fol.error || imp.error
  if (error) return { data: null, error }
  return { data: { productos: niv.data.productos, plantas: pl.data, movimientos: mov.data, folios: fol.data, importaciones: imp.data }, error: null }
}

export const importarDiarios = ({ archivo, docs, sinClave, notas }) =>
  supabase
    ? supabase.rpc('frisa_pl_importar', { p_archivo: archivo || null, p_docs: docs, p_sin_clave: sinClave || 0, p_notas: notas || null })
    : Promise.resolve(sinCliente())
