import { useCallback, useEffect, useState } from 'react'
import { fetchProfiles } from '../services/usersService'
import { supabase } from '../lib/supabaseClient'

export function useProfiles() {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchProfiles()
    if (fetchError) {
      setError(fetchError)
    } else {
      setProfiles(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    if (!supabase) return
    const channel = supabase
      .channel('profiles-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  return { profiles, loading, error, refresh: load }
}
