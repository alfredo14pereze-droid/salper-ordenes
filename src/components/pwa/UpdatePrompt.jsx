import { useRegisterSW } from 'virtual:pwa-register/react'

const CHECK_EVERY_MS = 30 * 60 * 1000

// Aviso de nueva versión: el service worker nuevo queda "en espera" hasta que
// la persona pulse Actualizar (así nunca se queda pegada una versión vieja ni
// se recarga sola a media captura).
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => registration.update().catch(() => {})
      setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

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
