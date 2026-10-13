import { useRegisterSW } from 'virtual:pwa-register/react'

// La app se actualiza SOLA (V150, registerType 'autoUpdate' en vite.config.js):
// cuando hay una versión nueva, el service worker la instala y la página se
// recarga. Antes había que pulsar "Actualizar" y mucha gente se quedaba con
// versiones viejas sin saberlo.
//
// Para no recargar a media captura, solo se busca versión nueva en dos
// momentos: al abrir la app y al cambiar de pantalla (un formulario a medio
// llenar no sobrevive a un cambio de pantalla de todos modos; "Nueva orden"
// guarda su borrador). Ya no se busca cada 30 minutos ni al volver a la
// pestaña, que es justo cuando alguien regresa a seguir capturando.
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      window.addEventListener('hashchange', () => registration.update().catch(() => {}))
    },
  })

  // Con autoUpdate no debería hacer falta; se queda por si un navegador deja
  // la versión nueva en espera.
  if (!needRefresh) return null
  return (
    <div className="update-banner" role="status">
      <span>Hay una nueva versión</span>
      <button type="button" className="btn btn--primary btn--small" onClick={() => updateServiceWorker(true)}>
        Actualizar
      </button>
    </div>
  )
}
