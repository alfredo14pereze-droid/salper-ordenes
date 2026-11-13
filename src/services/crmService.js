import { supabase } from '../lib/supabaseClient'

// V207 — CRM de prospectos. Lectura directa (RLS: solo con crm.usar);
// escritura por RPC crm_* — ver supabase/schema_v207_crm_prospectos.sql.

function ensureClient() {
  if (!supabase) return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  return { error: null }
}

// Trae todas las filas (Supabase regresa máximo 1000 por consulta).
async function todas(armar) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999)
    if (error) return { data: null, error }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return { data: out, error: null }
}

// Todo lo necesario para la lista: empresas, contactos y seguimientos pendientes.
export async function fetchCrmLista() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  const [emp, con, seg, act] = await Promise.all([
    todas(() => supabase.from('crm_empresas').select('*').order('nombre')),
    todas(() => supabase.from('crm_contactos').select('id, empresa_id, nombre, puesto, telefono, correo, es_principal')),
    todas(() => supabase.from('crm_seguimientos').select('id, empresa_id, fecha, nota, asignado_a').is('completado_en', null).order('fecha')),
    // Para las estadísticas: solo lo necesario de la bitácora.
    todas(() => supabase.from('crm_actividades').select('id, empresa_id, contacto_id, fecha, tipo, nota, usuario_id, creado_en').order('fecha')),
  ])
  for (const r of [emp, con, seg, act]) if (r.error) return { data: null, error: r.error }
  return { data: { empresas: emp.data, contactos: con.data, seguimientos: seg.data, actividades: act.data }, error: null }
}

export async function fetchCrmEmpresa(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  const [emp, con, act, seg] = await Promise.all([
    supabase.from('crm_empresas').select('*').eq('id', id).maybeSingle(),
    supabase.from('crm_contactos').select('*').eq('empresa_id', id).order('es_principal', { ascending: false }).order('nombre'),
    supabase.from('crm_actividades').select('*').eq('empresa_id', id).order('fecha', { ascending: false }).order('creado_en', { ascending: false }),
    supabase.from('crm_seguimientos').select('*').eq('empresa_id', id).order('fecha'),
  ])
  for (const r of [emp, con, act, seg]) if (r.error) return { data: null, error: r.error }
  return { data: { empresa: emp.data, contactos: con.data || [], actividades: act.data || [], seguimientos: seg.data || [] }, error: null }
}

// Personas que pueden llevar prospectos (id + nombre). Usa crm_usuarios (V208);
// si todavía no existe, regresa vacío y la pantalla usa solo al usuario actual.
export async function fetchCrmUsuarios() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: [], error: cfgError }
  const { data, error } = await supabase.rpc('crm_usuarios')
  if (error) return { data: [], error }
  return { data: data || [], error: null }
}

export async function empresasParecidas(nombre, excluirId = null) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: [], error: cfgError }
  const { data, error } = await supabase.rpc('crm_empresas_parecidas', { p_nombre: nombre, p_excluir: excluirId })
  return { data: data || [], error }
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

export async function guardarEmpresa({ id, nombre, ubicacion, segmento, origen, mesCompra, montoCotizado, montoVendido, responsableId }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('crm_guardar_empresa', {
      p_id: id || null,
      p_nombre: nombre,
      p_ubicacion: ubicacion || null,
      p_segmento: segmento || null,
      p_origen: origen || null,
      p_mes_compra: mesCompra ? Number(mesCompra) : null,
      p_monto_cotizado: num(montoCotizado),
      p_monto_vendido: num(montoVendido),
      p_responsable_id: responsableId || null,
    })
    .single()
}

export async function cambiarEstatus(id, estatus, { motivoPerdida, fechaSeguimiento, notaSeguimiento } = {}) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('crm_cambiar_estatus', {
      p_id: id,
      p_estatus: estatus,
      p_motivo_perdida: motivoPerdida || null,
      p_fecha_seguimiento: fechaSeguimiento || null,
      p_nota_seguimiento: notaSeguimiento || null,
    })
    .single()
}

export async function eliminarEmpresa(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('crm_eliminar_empresa', { p_id: id })
}

export async function guardarContacto({ id, empresaId, nombre, puesto, telefono, correo, notas, esPrincipal }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('crm_guardar_contacto', {
      p_id: id || null,
      p_empresa_id: empresaId,
      p_nombre: nombre,
      p_puesto: puesto || null,
      p_telefono: telefono || null,
      p_correo: correo || null,
      p_notas: notas || null,
      p_es_principal: !!esPrincipal,
    })
    .single()
}

export async function eliminarContacto(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('crm_eliminar_contacto', { p_id: id })
}

export async function registrarActividad({ empresaId, tipo, fecha, nota, contactoId }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('crm_registrar_actividad', {
      p_empresa_id: empresaId,
      p_tipo: tipo,
      p_fecha: fecha,
      p_nota: nota || null,
      p_contacto_id: contactoId || null,
    })
    .single()
}

export async function crearSeguimiento({ empresaId, fecha, nota, asignadoA }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('crm_crear_seguimiento', { p_empresa_id: empresaId, p_fecha: fecha, p_nota: nota || null, p_asignado_a: asignadoA || null })
    .single()
}

export async function completarSeguimiento(id, completado = true) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('crm_completar_seguimiento', { p_id: id, p_completado: completado }).single()
}

// Lo que ya existe, para que la vista previa de la importación cuente igual que el servidor.
export async function fetchExistentesParaImportar() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  const [emp, con] = await Promise.all([
    todas(() => supabase.from('crm_empresas').select('id, nombre, creado_en').order('creado_en')),
    todas(() => supabase.from('crm_contactos').select('empresa_id, nombre, correo')),
  ])
  if (emp.error) return { data: null, error: emp.error }
  if (con.error) return { data: null, error: con.error }
  return { data: { empresas: emp.data, contactos: con.data }, error: null }
}

export async function importarProspectos(filas) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('crm_importar', { p_filas: filas })
}

// Contador del menú: seguimientos vencidos + de hoy asignados a esta persona
// (solo de empresas que siguen en el CRM).
export async function contarMisPendientes(userId, hoy) {
  const { error: cfgError } = ensureClient()
  if (cfgError || !userId) return { data: 0, error: cfgError }
  const { data, error } = await supabase
    .from('crm_seguimientos')
    .select('id, empresa_id')
    .is('completado_en', null)
    .eq('asignado_a', userId)
    .lte('fecha', hoy)
  if (error) return { data: 0, error }
  const ids = [...new Set((data || []).map((s) => s.empresa_id))]
  if (ids.length === 0) return { data: 0, error: null }
  const { data: vivas, error: err2 } = await supabase.from('crm_empresas').select('id').in('id', ids)
  if (err2) return { data: 0, error: err2 }
  const ok = new Set((vivas || []).map((e) => e.id))
  return { data: data.filter((s) => ok.has(s.empresa_id)).length, error: null }
}
