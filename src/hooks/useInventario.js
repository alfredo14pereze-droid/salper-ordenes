import { useCallback, useEffect, useState } from 'react'
import { fetchSecciones, fetchUbicaciones, fetchTallas, fetchMotivos, fetchExistencias } from '../services/inventarioService'

// Catálogos base del módulo (secciones/ubicaciones/tallas/motivos) — se
// cargan una vez y se reusan en toda la pantalla principal, traspasos,
// conteos y administración. Sin realtime: cada pantalla llama `refresh()`
// tras su propio cambio (mismo criterio que Talleros/Pedidos Colegio).
export function useInventarioCatalogos() {
  const [secciones, setSecciones] = useState([])
  const [ubicaciones, setUbicaciones] = useState([])
  const [tallas, setTallas] = useState([])
  const [motivos, setMotivos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [s, u, t, m] = await Promise.all([fetchSecciones(), fetchUbicaciones(), fetchTallas(), fetchMotivos()])
    const firstError = s.error || u.error || t.error || m.error
    if (firstError) {
      setError(firstError)
    } else {
      setSecciones(s.data || [])
      setUbicaciones(u.data || [])
      setTallas(t.data || [])
      setMotivos(m.data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { secciones, ubicaciones, tallas, motivos, loading, error, refresh: load }
}

// Existencias de una sección (o de todas si seccionId es null) — filas
// planas de (artículo × ubicación activa), tal como las regresa
// inv_existencias(). El resto de la pantalla las agrupa/pivotea.
// `seccionId === undefined` significa "todavía no se decide cuál sección
// mostrar" (esperando a que carguen los catálogos) y no dispara ningún
// fetch — para no traer las 15 secciones completas de más en cada carga
// de la pantalla, solo para descartarlo un instante después. `null`
// explícito sí trae todas las secciones (lo usa el buscador de traspasos).
export function useInventarioExistencias(seccionId) {
  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const ready = seccionId !== undefined

  const load = useCallback(async () => {
    if (!ready) return
    setLoading(true)
    const { data, error: fetchError } = await fetchExistencias(seccionId ?? null)
    if (fetchError) {
      setError(fetchError)
    } else {
      setFilas(data || [])
      setError(null)
    }
    setLoading(false)
  }, [seccionId, ready])

  useEffect(() => {
    load()
  }, [load])

  return { filas, loading: ready ? loading : true, error, refresh: load }
}
