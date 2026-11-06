import { supabase } from '../lib/supabaseClient'
import { fetchFrisaNiveles } from './frisaNivelesService'

// V188 — Revisión contra Microsip. Lectura con fn.ver; guardar con frisa_microsip_guardar (fm.revisar).
const sinCliente = () => ({ data: null, error: new Error('Supabase no está configurado (revisa tu archivo .env).') })

export async function fetchMicrosipTodo() {
  if (!supabase) return sinCliente()
  const [niv, cod, rev] = await Promise.all([
    fetchFrisaNiveles(),
    supabase.from('frisa_clave_microsip').select('*').range(0, 4999),
    supabase.from('frisa_revisiones_microsip').select('*').order('creado_en', { ascending: false }).limit(50),
  ])
  const error = niv.error || cod.error || rev.error
  if (error) return { data: null, error }
  return { data: { productos: niv.data.productos, codigos: cod.data, revisiones: rev.data }, error: null }
}

export const guardarRevisionMicrosip = ({ fechaCorte, archivo, lineas, ajustar, sinLigar, notas }) =>
  supabase
    ? supabase.rpc('frisa_microsip_guardar', {
        p_fecha_corte: fechaCorte, p_archivo: archivo || null, p_lineas: lineas, p_ajustar: ajustar || [],
        p_sin_ligar: sinLigar || 0, p_notas: notas || null,
      })
    : Promise.resolve(sinCliente())
