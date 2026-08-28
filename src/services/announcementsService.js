import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// Anuncios internos, más recientes primero, con los fijados ("pinned")
// siempre arriba.
export async function fetchAnnouncements() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .from('announcements')
    .select('*')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
}

export async function createAnnouncement({ title, body, pinned }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_announcement', { p_title: title, p_body: body, p_pinned: !!pinned })
    .single()
}

export async function deleteAnnouncement(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { error: cfgError }

  return supabase.rpc('delete_announcement', { p_id: id })
}

export function subscribeToAnnouncements(onChange) {
  if (!supabase) return () => {}

  const channel = supabase
    .channel('announcements-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, onChange)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
