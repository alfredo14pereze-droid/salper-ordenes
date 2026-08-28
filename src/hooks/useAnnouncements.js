import { useCallback, useEffect, useState } from 'react'
import { fetchAnnouncements, subscribeToAnnouncements } from '../services/announcementsService'

export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchAnnouncements()
    if (fetchError) {
      setError(fetchError)
    } else {
      setAnnouncements(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const unsubscribe = subscribeToAnnouncements(() => load())
    return unsubscribe
  }, [load])

  return { announcements, loading, error, refresh: load }
}
