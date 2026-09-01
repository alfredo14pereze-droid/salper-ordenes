export default function ChatMessage({ role, content }) {
  const isUser = role === 'user'
  return (
    <div className={'chat-widget__message' + (isUser ? ' chat-widget__message--user' : '')}>
      <div className="chat-widget__bubble">{content}</div>
    </div>
  )
}
