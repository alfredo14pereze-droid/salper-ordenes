import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useChat } from '../../hooks/useChat'
import ChatMessage from './ChatMessage'

// Widget de chat flotante, disponible en toda la app (ver AppLayout).
// Solo para usuarios con sesión: el endpoint cuesta dinero real por
// mensaje (API de Anthropic), así que para invitados ni se muestra el
// botón — ver api/chat.js para el porqué del lado del servidor.
export default function ChatWidget() {
  const { user } = useAuth()
  const { messages, sending, error, send, clear } = useChat()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, open])

  if (!user) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!input.trim() || sending) return
    const text = input
    setInput('')
    await send(text)
  }

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-widget__panel">
          <div className="chat-widget__header">
            <span>Asistente SALPER</span>
            <div className="chat-widget__header-actions">
              {messages.length > 0 && (
                <button type="button" className="chat-widget__icon-btn" onClick={clear} aria-label="Limpiar chat" title="Limpiar chat">
                  ↺
                </button>
              )}
              <button type="button" className="chat-widget__icon-btn" onClick={() => setOpen(false)} aria-label="Cerrar chat">
                ×
              </button>
            </div>
          </div>

          <div className="chat-widget__messages" ref={scrollRef}>
            {messages.length === 0 && (
              <p className="chat-widget__hint">
                Pregunta lo que quieras sobre las órdenes — ej. "¿cuántas órdenes de Halcones FC van atrasadas?" o
                "resumen de lo que está en sublimado".
              </p>
            )}
            {messages.map((m, i) => (
              <ChatMessage key={i} role={m.role} content={m.content} />
            ))}
            {sending && (
              <div className="chat-widget__message">
                <div className="chat-widget__bubble chat-widget__bubble--loading">Pensando…</div>
              </div>
            )}
            {error && <p className="form-error" style={{ margin: '4px 12px' }}>{error.message}</p>}
          </div>

          <form className="chat-widget__input-row" onSubmit={handleSubmit}>
            <input
              type="text"
              className="input"
              placeholder="Escribe tu pregunta…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
            />
            <button type="submit" className="btn btn--primary btn--small" disabled={sending || !input.trim()}>
              Enviar
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="chat-widget__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar chat' : 'Abrir chat'}
      >
        {open ? '×' : '💬'}
      </button>
    </div>
  )
}
