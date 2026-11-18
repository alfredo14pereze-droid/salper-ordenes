import { useEffect, useRef, useState } from 'react'
import { Icono, IconoWhatsApp } from './Iconos'
import { TIENDA, linkWhatsApp } from './content'

const SITIO = 'https://www.salperdeportes.com'

// Título, descripción y canonical de cada página pública (la página es una
// SPA: index.html trae los de "/" y aquí se cambian al navegar).
export function usePagina(titulo, descripcion, ruta) {
  useEffect(() => {
    document.title = titulo
    const poner = (selector, attr, valor) => {
      const el = document.querySelector(selector)
      if (el) el.setAttribute(attr, valor)
    }
    poner('meta[name="description"]', 'content', descripcion)
    poner('link[rel="canonical"]', 'href', SITIO + ruta)
    poner('meta[property="og:url"]', 'content', SITIO + ruta)
    poner('meta[property="og:title"]', 'content', titulo)
    poner('meta[property="og:description"]', 'content', descripcion)
  }, [titulo, descripcion, ruta])
}

// Aparición suave al hacer scroll: agrega .is-visible cuando el elemento
// entra a la pantalla (una sola vez). Sin IntersectionObserver = visible.
export function useAparecer() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible')
      return
    }
    const obs = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible')
            obs.unobserve(e.target)
          }
        })
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    )
    el.querySelectorAll('.ps-aparece').forEach((n) => obs.observe(n))
    return () => obs.disconnect()
  }, [])
  return ref
}

// ---------- Horario de la tienda ----------
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DIA_CORTO = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const aMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
export const horaBonita = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h}:${String(m).padStart(2, '0')}`
}

// Día (0-6) y minuto del día en la zona de la tienda.
export function ahoraEnTienda(fecha = new Date(), zona = TIENDA.zonaHoraria) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha)
  const v = (t) => partes.find((p) => p.type === t)?.value
  return { dia: DIA_CORTO[v('weekday')], minuto: Number(v('hour')) * 60 + Number(v('minute')) }
}

const turnoDe = (dia, horario) => horario.find((h) => h.dias.includes(dia))

// { abierto, texto } — p. ej. "Abierto ahora · cierra a las 19:00" o
// "Cerrado · abre mañana a las 9:00".
export function estadoTienda(fecha = new Date(), horario = TIENDA.horario) {
  const { dia, minuto } = ahoraEnTienda(fecha)
  const hoy = turnoDe(dia, horario)
  if (hoy && minuto >= aMin(hoy.abre) && minuto < aMin(hoy.cierra)) {
    return { abierto: true, texto: `Abierto ahora · cierra a las ${horaBonita(hoy.cierra)}` }
  }
  if (hoy && minuto < aMin(hoy.abre)) {
    return { abierto: false, texto: `Cerrado · abre hoy a las ${horaBonita(hoy.abre)}` }
  }
  for (let i = 1; i <= 7; i++) {
    const d = (dia + i) % 7
    const t = turnoDe(d, horario)
    if (t) {
      const cuando = i === 1 ? 'mañana' : `el ${DIAS[d]}`
      return { abierto: false, texto: `Cerrado · abre ${cuando} a las ${horaBonita(t.abre)}` }
    }
  }
  return { abierto: false, texto: 'Cerrado' }
}

export function EstadoTienda() {
  const [estado, setEstado] = useState(() => estadoTienda())
  useEffect(() => {
    const id = setInterval(() => setEstado(estadoTienda()), 60 * 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className={'ps-abierto' + (estado.abierto ? ' is-abierto' : '')}>
      <span className="ps-abierto__punto" aria-hidden="true" />
      {estado.texto}
    </span>
  )
}

export const direccionTienda = () => `${TIENDA.calle}, ${TIENDA.colonia}, ${TIENDA.ciudad}, ${TIENDA.estado}`
export const linkComoLlegar = () =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(TIENDA.mapaBusqueda)}`

// Dirección + horario + "abierto ahora" (lo usan /tienda y /escolar).
export function TiendaInfo({ whatsapp, botonWhatsApp, comoLlegar = true }) {
  return (
    <div className="ps-tienda-info">
      <div className="ps-tienda-info__fila">
        <Icono nombre="mapa" size={22} />
        <div>
          <strong>Dirección</strong>
          <p>{direccionTienda()}</p>
          {comoLlegar && (
            <a className="ps-enlace" href={linkComoLlegar()} target="_blank" rel="noopener noreferrer">
              Cómo llegar <Icono nombre="flecha" size={16} />
            </a>
          )}
        </div>
      </div>
      <div className="ps-tienda-info__fila">
        <Icono nombre="reloj" size={22} />
        <div>
          <strong>Horario</strong>
          <EstadoTienda />
          <dl className="ps-horario">
            {TIENDA.horario.map((h) => (
              <div key={h.etiqueta}>
                <dt>{h.etiqueta}</dt>
                <dd>
                  {horaBonita(h.abre)} – {horaBonita(h.cierra)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {whatsapp && (
        <a href={linkWhatsApp(whatsapp)} className="ps-btn ps-btn--whatsapp" target="_blank" rel="noopener noreferrer">
          <IconoWhatsApp /> {botonWhatsApp}
        </a>
      )}
    </div>
  )
}

export function MapaTienda() {
  const src = `https://www.google.com/maps?q=${encodeURIComponent(TIENDA.mapaBusqueda)}&z=17&output=embed`
  return (
    <div className="ps-mapa">
      <iframe
        title="Mapa de la tienda SALPER en el centro de Torreón"
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    </div>
  )
}
