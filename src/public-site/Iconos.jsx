// Íconos en SVG en línea (sin librerías): trazo de 1.8px, heredan currentColor.
const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

const PATHS = {
  diseno: <><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></>,
  corte: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.12 15.88" /><path d="M14.47 14.48L20 20" /><path d="M8.12 8.12L12 12" /></>,
  costura: <><path d="M3 21l6-6" /><path d="M14 4c2-2 5-1 6 0s2 4 0 6l-8 8-6-6 8-8z" /><path d="M14 10h.01" /></>,
  serigrafia: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M7 20h10" /><path d="M12 16v4" /><path d="M7 10h10" /></>,
  bordado: <><circle cx="12" cy="12" r="8" /><path d="M8 12c1.5-2 2.5-2 4 0s2.5 2 4 0" /><path d="M12 4v2M12 18v2" /></>,
  sublimacion: <><path d="M12 2.7c3 3.7 6 6.9 6 10.3a6 6 0 0 1-12 0c0-3.4 3-6.6 6-10.3z" /><path d="M9 14a3 3 0 0 0 3 3" /></>,
  empaque: <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  cerrar: <><path d="M6 6l12 12M18 6L6 18" /></>,
  telefono: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></>,
  correo: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 6L2 7" /></>,
  descargar: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
  pdf: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15h6M9 18h4" /></>,
  flecha: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  check: <><path d="M20 6L9 17l-5-5" /></>,
  usuario: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  // Fase 2
  calidad: <><circle cx="12" cy="9" r="6" /><path d="M8.5 13.7L7 22l5-3 5 3-1.5-8.3" /><path d="M12 6.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" /></>,
  reloj: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  saludo: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></>,
  escudo: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>,
  equipo: <><circle cx="9" cy="8" r="3.5" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M16 4.3a3.5 3.5 0 0 1 0 7.4" /><path d="M18 14.5a7 7 0 0 1 4 6.5" /></>,
  mejora: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  mineria: <><path d="M3 18a9 9 0 0 1 18 0z" /><path d="M10 9V5h4v4" /><path d="M2 18h20v2H2z" /></>,
  fabrica: <><path d="M2 20V10l6 4v-4l6 4V4h4l1 16z" /><path d="M2 20h20" /><path d="M7 17h2M12 17h2" /></>,
  alimentos: <><path d="M5 2v8a3 3 0 0 0 6 0V2" /><path d="M8 2v20" /><path d="M17 2c-2 0-3 3-3 7s1 5 3 5v8" /></>,
  salud: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></>,
  educacion: <><path d="M22 9L12 4 2 9l10 5 10-5z" /><path d="M6 11v5c3 2.5 9 2.5 12 0v-5" /><path d="M22 9v6" /></>,
  gastronomia: <><path d="M6 13.9A4 4 0 0 1 7.5 6a5 5 0 0 1 9 0A4 4 0 0 1 18 13.9V20H6z" /><path d="M6 17h12" /></>,
  maletin: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><path d="M2 13h20" /></>,
  chat: <><path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6A8 8 0 1 1 21 12z" /></>,
  camion: <><path d="M1 4h13v12H1z" /><path d="M14 9h4l3 3v4h-7" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="17.5" cy="18.5" r="2" /></>,
  maquila: <><path d="M2 20V10l6 4v-4l6 4V4h4l1 16z" /><path d="M2 20h20" /><path d="M7 17h2M12 17h2" /></>,
  mapa: <><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
  tienda: <><path d="M3 9l1.5-5h15L21 9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M5 12v9h14v-9" /><path d="M10 21v-5h4v5" /></>,
  colegio: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M8 10h8M12 7v9" /></>,
  enviar: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>,
}

export function Icono({ nombre, size = 24, ...rest }) {
  return (
    <svg {...base} width={size} height={size} {...rest}>
      {PATHS[nombre]}
    </svg>
  )
}

// Marcas (relleno sólido).
export function IconoWhatsApp({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.3-1.5-5.2C2.2 6.6 6.6 2.2 12 2.2c2.6 0 5.1 1 6.9 2.9 1.9 1.9 2.9 4.3 2.9 6.9 0 5.4-4.4 9.8-9.8 9.8zM20.4 3.6C18.2 1.3 15.2 0 12 0 5.5 0 .1 5.3.1 11.9c0 2.1.5 4.1 1.6 5.9L0 24l6.3-1.7c1.7.9 3.7 1.4 5.7 1.4 6.5 0 11.9-5.3 11.9-11.9 0-3.2-1.2-6.2-3.5-8.2z" />
    </svg>
  )
}

export function IconoRed({ red, size = 20 }) {
  const p = {
    facebook: 'M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v9h4v-9H17l.5-4h-4V8.8c0-.5.3-.8.5-.8z',
    instagram:
      'M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zm0 4.7a5.1 5.1 0 1 0 0 10.2 5.1 5.1 0 0 0 0-10.2zm0 8.4a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6zm5.3-9.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z',
  }[red]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={p} />
    </svg>
  )
}
