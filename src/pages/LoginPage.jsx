import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/layout/Logo'
import { destinoSeguro, irA } from '../lib/rutas'

// Sin registro público a propósito: solo un admin puede dar de alta
// usuarios nuevos (ver pages/UsersPage.jsx), así que aquí no hay link de
// "crear cuenta".
//
// Vive en /login (fuera de /app). En cuanto hay sesión, manda al sistema:
// a la ruta que se intentaba abrir (?next=/app/...) o, si no, a /app.
export default function LoginPage() {
  const { user, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (user) irA(destinoSeguro(new URLSearchParams(window.location.search).get('next')))
  }, [user])

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
          <span className="app-header__subtitle">Sistema Operativo</span>
        </div>

        <form onSubmit={handleSubmit} className="order-form" data-enter-normal>
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
        <p className="login-card__hint">¿Olvidaste tu contraseña? Pídele al administrador que te ponga una nueva.</p>
        <p className="login-card__hint">
          <a href="/app/instalar">Instalar la app</a>
        </p>
        <p className="login-card__hint">
          <a href="/">← Volver a salperdeportes.com</a>
        </p>
      </div>
    </div>
  )
}
