import { supabase } from '../lib/supabaseClient'
import { conCodigos } from './frisaNivelesService'

// V185 — Frisa: órdenes de surtido e inventario por movimientos. Lectura
// directa (RLS: fs.ver); escritura SIEMPRE por las funciones de
// supabase/schema_v185_frisa_surtido.sql.

const sinCliente = () => ({ data: null, error: new Error('Supabase no está configurado (revisa tu archivo .env).') })
const BUCKET = 'orden-documentos'

async function todas(tabla, orden, filtro) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    let q = supabase.from(tabla).select('*')
    if (filtro) q = filtro(q)
    for (const [col, asc] of orden) q = q.order(col, { ascending: asc })
    const { data, error } = await q.range(desde, desde + 999)
    if (error) return { data: null, error }
    out.push(...data)
    if (data.length < 1000) return { data: out, error: null }
  }
}

// Todo lo que usan Niveles, Órdenes de surtido y Urgente.
export async function fetchSurtidoTodo() {
  if (!supabase) return sinCliente()
  const [pr, su, li, al] = await Promise.all([
    todas('frisa_productos_niveles', [['clave', true]], (q) => q.eq('activo', true)),
    todas('frisa_surtidos', [['creado_en', false]]),
    todas('frisa_surtido_lineas', [['clave', true]]),
    todas('frisa_niveles_alias', [['texto', true]]), // solo quien tiene fs.oc; a los demás les llega vacío
  ])
  const error = [pr, su, li, al].find((x) => x.error)?.error
  if (error) return { data: null, error }
  return { data: { productos: await conCodigos(pr.data), surtidos: su.data, lineas: li.data, alias: al.data }, error: null }
}

export async function fetchEventosSurtido(surtidoId) {
  if (!supabase) return sinCliente()
  return supabase.from('frisa_surtido_eventos').select('*').eq('surtido_id', surtidoId).order('fecha', { ascending: true }).limit(200)
}

export async function fetchMovimientosClave(productoId) {
  if (!supabase) return sinCliente()
  return supabase.from('frisa_inv_movimientos').select('*').eq('producto_id', productoId).order('creado_en', { ascending: false }).limit(200)
}

const rpc = (fn, args) => (supabase ? supabase.rpc(fn, args) : Promise.resolve(sinCliente()))

export const personasSurtido = () => rpc('frisa_surtido_personas', {})

export const crearSurtido = (s) => rpc('frisa_surtido_crear', {
  p_numero_oc: s.numero_oc, p_planta: s.planta, p_fecha_oc: s.fecha_oc || null, p_fecha_limite: s.fecha_limite || null,
  p_lineas: s.lineas, p_pdf_path: s.pdf_path || null, p_leido_pdf: s.leido_pdf || null, p_notas: s.notas || null,
})

export const editarSurtido = (id, s) => rpc('frisa_surtido_editar', {
  p_id: id, p_numero_oc: s.numero_oc, p_planta: s.planta, p_fecha_oc: s.fecha_oc || null, p_fecha_limite: s.fecha_limite || null,
  p_lineas: s.lineas, p_notas: s.notas || null,
})

export const marcarSurtida = (id, { personaId, personaNombre }) =>
  rpc('frisa_surtido_marcar_surtida', { p_id: id, p_persona_id: personaId || null, p_persona_nombre: personaNombre || null })

export const regresarSurtida = (id, motivo) => rpc('frisa_surtido_regresar', { p_id: id, p_motivo: motivo || null })

export const entregarSurtido = (id, { remision, fecha }) =>
  rpc('frisa_surtido_entregar', { p_id: id, p_remision: remision, p_fecha: fecha || null })

export const cancelarSurtido = (id, motivo) => rpc('frisa_surtido_cancelar', { p_id: id, p_motivo: motivo })

// PDF de la OC en el bucket privado de documentos.
export async function subirPdfOC(file) {
  if (!supabase) return sinCliente()
  const limpio = file.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80)
  const path = `frisa-oc/${Date.now()}-${limpio}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/pdf', upsert: false })
  return error ? { data: null, error } : { data: path, error: null }
}

export async function urlPdfOC(path) {
  if (!supabase) return sinCliente()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600)
  return error ? { data: null, error } : { data: data.signedUrl, error: null }
}

// Para Niveles: solo lo necesario para calcular lo apartado.
export async function fetchSurtidosYLineas() {
  if (!supabase) return sinCliente()
  const [su, li] = await Promise.all([
    todas('frisa_surtidos', [['creado_en', false]]),
    todas('frisa_surtido_lineas', [['clave', true]]),
  ])
  const error = su.error || li.error
  return error ? { data: null, error } : { data: { surtidos: su.data, lineas: li.data }, error: null }
}

// V190 — palomear un renglón como embolsado.
export const marcarRenglon = (lineaId, embolsada) => rpc('frisa_surtido_marcar_renglon', { p_linea_id: lineaId, p_embolsada: embolsada })
