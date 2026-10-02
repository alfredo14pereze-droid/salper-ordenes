import { useEffect } from 'react'

// V127 — Enter avanza al siguiente campo en TODOS los formularios de captura
// (los que usan la clase `order-form`, más cualquier contenedor con
// `data-enter-next`), para llenar una orden/pendiente/movimiento sin tocar el
// mouse. Se instala una sola vez (AppLayout) con un listener global:
//   - Enter en un input/select pasa al siguiente campo visible y editable;
//     el último paso es el botón de guardar del formulario (otro Enter lo manda).
//   - Si un campo ya manejó el Enter por su cuenta (roster, folios, etc.) se
//     respeta: `defaultPrevented` lo detecta.
//   - En <textarea> Enter sigue siendo salto de línea (Ctrl/⌘+Enter avanza).
//   - Un formulario con `data-enter-normal` (login) conserva el Enter de siempre.
const CONTENEDOR = 'form.order-form, [data-enter-next]'
const TIPOS_SALTADOS = ['hidden', 'file', 'image', 'button', 'reset', 'submit']

function esEditableYVisible(el) {
  if (el.disabled || el.readOnly || el.tabIndex < 0) return false
  if (el instanceof HTMLInputElement && TIPOS_SALTADOS.includes(el.type)) return false
  return visible(el)
}

// Los campos dentro de un <details> cerrado dan rectángulos pero no aceptan foco.
function visible(el) {
  if (el.closest('details:not([open])')) return false
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) return false
  return el.getClientRects().length > 0
}

function candidatos(contenedor) {
  const vistos = new Set() // un solo paso por grupo de radios
  const lista = [...contenedor.querySelectorAll('input, select, textarea, button[type="submit"]')].filter((el) => {
    if (el instanceof HTMLButtonElement) return !el.disabled && visible(el)
    if (!esEditableYVisible(el)) return false
    if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
      if (vistos.has(el.name)) return false
      vistos.add(el.name)
    }
    return true
  })
  return lista
}

function onKeyDown(e) {
  if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.shiftKey || e.altKey) return
  const t = e.target
  const esTextarea = t instanceof HTMLTextAreaElement
  if (esTextarea ? !(e.ctrlKey || e.metaKey) : e.ctrlKey || e.metaKey) return
  if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || esTextarea)) return
  if (t instanceof HTMLInputElement && TIPOS_SALTADOS.includes(t.type)) return

  const contenedor = t.closest(CONTENEDOR)
  if (!contenedor || contenedor.closest('[data-enter-normal]') || contenedor.hasAttribute('data-enter-normal')) return

  const lista = candidatos(contenedor)
  const i = lista.indexOf(t)
  if (i < 0 || i === lista.length - 1) return // último campo sin botón de guardar: Enter normal

  e.preventDefault()
  // Se prueba cada campo siguiente hasta que uno acepte el foco.
  for (let j = i + 1; j < lista.length; j++) {
    const siguiente = lista[j]
    siguiente.focus()
    if (document.activeElement !== siguiente) continue
    if (siguiente instanceof HTMLInputElement && siguiente.type !== 'checkbox' && siguiente.type !== 'radio') {
      try {
        siguiente.select()
      } catch {
        // algunos tipos (date, number) no permiten select(); no es crítico
      }
    }
    return
  }
}

// En celular el teclado muestra "Siguiente" en vez de salto de línea.
function onFocusIn(e) {
  const t = e.target
  if (!(t instanceof HTMLInputElement) || !t.closest(CONTENEDOR) || t.closest('[data-enter-normal]')) return
  t.enterKeyHint = 'next'
}

export function useEnterComoTab() {
  useEffect(() => {
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [])
}
