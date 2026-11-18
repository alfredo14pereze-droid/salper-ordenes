// Página pública + sistema detrás del login.
//
//   /            página pública (src/public-site)
//   /catalogo    catálogo público
//   /login       login del sistema
//   /app/...     sistema operativo (BrowserRouter con basename "/app": todos
//                los navigate('/x') / <Link to="/x"> internos quedan en /app/x
//                sin tocarlos)
//
// Antes el sistema usaba HashRouter (salperdeportes.com/#/orden/123). Esas
// direcciones viejas (favoritos, accesos directos, la app instalada) se
// redirigen solas a /app/... en main.jsx (ver rutaDesdeHashViejo).

export const BASE_SISTEMA = '/app'

export function esRutaSistema(pathname) {
  return pathname === BASE_SISTEMA || pathname.startsWith(BASE_SISTEMA + '/')
}

export function esRutaLogin(pathname) {
  return pathname === '/login' || pathname === '/login/'
}

// "/#/orden/5?x=1" → "/app/orden/5?x=1". null si no es una dirección vieja.
export function rutaDesdeHashViejo(hash) {
  if (!hash || !hash.startsWith('#/')) return null
  const resto = hash.slice(1)
  return BASE_SISTEMA + (resto === '/' ? '' : resto)
}

// Solo se acepta regresar a una ruta del sistema (evita redirecciones a
// otros sitios con ?next=https://...).
export function destinoSeguro(next) {
  if (typeof next === 'string' && esRutaSistema(next.split(/[?#]/)[0]) && !next.startsWith('//')) {
    return next
  }
  return BASE_SISTEMA
}

// Cambia de "modo" (login ↔ sistema) sin recargar la página: actualiza la
// URL y avisa a App.jsx, que vuelve a decidir qué montar.
export function irA(url) {
  window.history.replaceState(null, '', url)
  window.dispatchEvent(new Event('salper:ruta'))
}

let saliendo = false
export function estaSaliendo() {
  return saliendo
}

// "Cerrar sesión" dentro del sistema → regresa a la página pública.
export async function cerrarSesion(signOut) {
  saliendo = true
  window.dispatchEvent(new Event('salper:ruta'))
  try {
    await signOut()
  } finally {
    window.location.replace('/')
  }
}
