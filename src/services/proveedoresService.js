import { supabase } from '../lib/supabaseClient'

// Catálogo de proveedores (ver schema_v19_proveedores.sql) — a diferencia
// de telas/clientes, es de lectura SOLO autenticada: vive dentro del
// módulo de Pedidos a Proveedor, que no tiene modo invitado.

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

export async function fetchProveedores() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('proveedores').select('*').order('nombre', { ascending: true })
}

// "Crear o reusar" — ver create_proveedor en schema_v19_proveedores.sql.
// El duplicado EXACTO (mismo nombre normalizado) nunca truena, regresa el
// existente tal cual está (no pisa contacto/tipo_material/notas ya
// capturados). El duplicado "parecido" se avisa aparte en el frontend
// antes de llamar esto (ver utils/similarity.js), no aquí.
export async function createProveedor({ nombre, contacto, tipoMaterial, notas }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_proveedor', {
      p_nombre: nombre,
      p_contacto: contacto || null,
      p_tipo_material: tipoMaterial || null,
      p_notas: notas || null,
    })
    .single()
}
