import { useState } from 'react'
import { sendChatMessage } from '../services/chatService'

// Estado del chat: solo en memoria de la sesión (no persiste al
// recargar la página, a propósito — ver el módulo api/_chat para el
// lado del servidor).
export function useChat() {
  const [messages, setMessages] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  async function send(text) {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    const history = messages
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }])
    setSending(true)
    setError(null)

    const { data, error: sendError } = await sendChatMessage(trimmed, history)
    setSending(false)

    if (sendError) {
      setError(sendError)
      return
    }
    setMessages((prev) => [...prev, { role: 'assistant', content: data }])
  }

  function clear() {
    setMessages([])
    setError(null)
  }

  return { messages, sending, error, send, clear }
}
