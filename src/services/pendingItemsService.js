import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// "Pendientes": cosas fuera del flujo de órdenes de producción (una
// reparación mandada a un taller externo, un trámite, una compra, etc.).
export async function fetchPendingItems() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('pending_items').select('*').order('created_at', { ascending: false })
}

export async function createPendingItem({ title, description, category }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_pending_item', {
      p_title: title,
      p_description: description || null,
      p_category: category || null,
    })
    .single()
}

export async function updatePendingItemStatus(id, status) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('update_pending_item_status', { p_id: id, p_status: status }).single()
}

export function subscribeToPendingItems(onChange) {
  if (!supabase) return () => {}

  const channel = supabase
    .channel('pending-items-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_items' }, onChange)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
