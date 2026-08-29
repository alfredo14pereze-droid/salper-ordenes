import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/layout/Logo'

// Sin registro público a propósito: solo un admin puede dar de alta
// usuarios nuevos (ver pages/UsersPage.jsx), así que aquí no hay link de
// "crear cuenta".
export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error: signInError } = await signIn(email.trim(), password)
    setSubmitting(false)

    if (signInError) {
      setError(
        /invalid login credentials/i.test(signInError.message)
          ? new Error('Correo o contraseña incorrectos.')
          : signInError
      )
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__brand">
          <Logo />
          <span className="app-header__subtitle">Órdenes de producción</span>
        </div>

        <form onSubmit={handleSubmit} className="order-form">
          <label>
            Correo
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@salper.com"
              autoComplete="username"
              required
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className="form-error">{error.message}</p>}

          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="login-card__hint">¿No tienes cuenta? Pídele acceso a un administrador.</p>
      </div>
    </div>
  )
}
