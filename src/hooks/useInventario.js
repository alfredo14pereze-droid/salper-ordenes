import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchSecciones,
  fetchUbicaciones,
  fetchTallas,
  fetchMotivos,
  fetchExistencias,
  fetchCatalogo,
  fetchClasificaciones,
  fetchTiposPrenda,
  fetchJuegosTallas,
} from '../services/inventarioService'
import { buildCatalogo, catalogoDesdeExistencias } from '../utils/inventarioCatalogo'

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

// V121 — catálogos de la estructura nueva (clasificaciones, tipos de
// prenda, juegos de tallas). Aparte de useInventarioCatalogos a propósito:
// si V121 todavía no está aplicado en la base estas tablas no existen, y
// eso no debe tumbar el resto del módulo — aquí un error solo deja las
// listas vacías.
export function useInventarioEstructura() {
  const [clasificaciones, setClasificaciones] = useState([])
  const [tipos, setTipos] = useState([])
  const [juegos, setJuegos] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [c, t, j] = await Promise.all([fetchClasificaciones(), fetchTiposPrenda(), fetchJuegosTallas()])
    setClasificaciones(c.data || [])
    setTipos(t.data || [])
    setJuegos(j.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { clasificaciones, tipos, juegos, loading, refresh: load }
}

// V121 — todo el inventario (todas las secciones) ya armado para pantalla
// y búsqueda: artículos con su nombre, existencia por ubicación e índice
// de búsqueda, y modelos con sus tallas. `sinV121` = la base todavía no
// tiene la migración; se cae a inv_existencias(null) y todo se ve como
// "sin clasificar" (igual que antes).
export function useInventarioCatalogo({ secciones, tallas, ubicaciones, tipos, listo }) {
  const [raw, setRaw] = useState(null)
  const [sinV121, setSinV121] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const res = await fetchCatalogo()
    if (res.sinV121) {
      const { data, error: exError } = await fetchExistencias(null)
      if (exError) setError(exError)
      else {
        setRaw(catalogoDesdeExistencias(data))
        setSinV121(true)
        setError(null)
      }
    } else if (res.error) {
      setError(res.error)
    } else {
      setRaw(res.data || { articulos: [], existencias: [], modelos: [], alias: [] })
      setSinV121(false)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const catalogo = useMemo(() => {
    if (!raw || !listo) return { articulos: [], modelos: [] }
    return buildCatalogo(raw, { secciones, tallas, ubicaciones, tipos })
  }, [raw, listo, secciones, tallas, ubicaciones, tipos])

  return { ...catalogo, sinV121, loading: loading || !listo, error, refresh: load }
}
