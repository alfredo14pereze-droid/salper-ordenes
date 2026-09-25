// El evento beforeinstallprompt suele dispararse antes de que se monte la
// página /instalar, así que se captura aquí desde el arranque de la app.
let deferredPrompt = null
const listeners = new Set()

function notify() {
  listeners.forEach((fn) => fn())
}

export function initPwaInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

export function subscribeInstall(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function canPromptInstall() {
  return Boolean(deferredPrompt)
}

export async function promptInstall() {
  if (!deferredPrompt) return null
  const ev = deferredPrompt
  deferredPrompt = null
  ev.prompt()
  const { outcome } = await ev.userChoice
  notify()
  return outcome
}

export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    window.navigator.standalone === true
  )
}

export function detectDevice() {
  const ua = navigator.userAgent || ''
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  const ios = /iPhone|iPad|iPod/.test(ua) || iPadOS
  const iosSafari = ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV/.test(ua)
  const android = /Android/.test(ua)
  return { ios, iosSafari, android, ipad: /iPad/.test(ua) || iPadOS }
}
