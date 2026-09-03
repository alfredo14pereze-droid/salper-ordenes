import { useState } from 'react'
import { useProfiles } from '../hooks/useProfiles'
import { createUser, updateUserRole } from '../services/usersService'
import RequireRole from '../components/common/RequireRole'
import { canManageUsers, ROLE_LABELS } from '../utils/permissions'
import { Loading, ErrorState } from '../components/common/States'

const ROLES = ['tienda', 'fabrica', 'admin']

function NewUserForm({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '', role: 'tienda' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  // Feedback inmediato mientras se escribe, sin esperar a que se intente
  // guardar — solo se muestra una vez que hay algo tecleado en la
  // confirmación (si ambos campos están vacíos, técnicamente "coinciden"
  // pero no hay nada que avisar todavía).
  const passwordsMismatch = form.confirmPassword.length > 0 && form.password !== form.confirmPassword

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.fullName.trim() || !form.email.trim() || !form.password || !form.confirmPassword) {
      setError(new Error('Completa nombre, correo, contraseña y confirmación.'))
      return
    }
    if (form.password.length < 6) {
      setError(new Error('La contraseña debe tener al menos 6 caracteres.'))
      return
    }
    // Bloquea el submit — no deja crear el usuario si no coinciden.
    // El backend (Edge Function admin-create-user) vuelve a validar esto
    // por si alguien se salta el frontend.
    if (form.password !== form.confirmPassword) {
      setError(new Error('Las contraseñas no coinciden.'))
      return
    }

    setSaving(true)
    setError(null)
    const { error: createError } = await createUser({
      email: form.email.trim(),
      password: form.password,
      confirmPassword: form.confirmPassword,
      fullName: form.fullName.trim(),
      role: form.role,
    })
    setSaving(false)

    if (createError) {
      setError(createError)
      return
    }

    setForm({ fullName: '', email: '', password: '', confirmPassword: '', role: 'tienda' })
    setOpen(false)
    onCreated?.()
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
        + Nuevo usuario
      </button>
    )
  }

  return (
    <form className="order-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Nombre completo
          <input
            type="text"
            className="input"
            value={form.fullName}
            onChange={(e) => updateField('fullName', e.target.value)}
            placeholder="Ej. Juan Pérez"
          />
        </label>
        <label>
          Correo
          <input
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="correo@salper.com"
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Contraseña inicial
          <input
            type="password"
            className="input"
            value={form.password}
            onChange={(e) => updateField('password', e.target.value)}
            placeholder="Mínimo 6 caracteres"
          />
        </label>
        <label>
          Confirmar contraseña
          <input
            type="password"
            className="input"
            value={form.confirmPassword}
            onChange={(e) => updateField('confirmPassword', e.target.value)}
            placeholder="Repite la contraseña"
          />
          {passwordsMismatch && (
            <span className="form-error" style={{ marginTop: 4, display: 'block' }}>
              Las contraseñas no coinciden.
            </span>
          )}
        </label>
      </div>

      <label>
        Rol
        <select className="input" value={form.role} onChange={(e) => updateField('role', e.target.value)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="form-error">{error.message}</p>}

      <div className="order-form__actions">
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving || passwordsMismatch}>
          {saving ? 'Creando…' : 'Crear usuario'}
        </button>
      </div>
    </form>
  )
}

function UserRow({ profile, onUpdated }) {
  const [role, setRole] = useState(profile.role)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleRoleChange(newRole) {
    setRole(newRole)
    setSaving(true)
    setError(null)
    const { error: updateError } = await updateUserRole(profile.id, newRole)
    setSaving(false)

    if (updateError) {
      setError(updateError)
      setRole(profile.role)
      return
    }
    onUpdated?.()
  }

  return (
    <div className="user-row">
      <div className="user-row__info">
        <span className="user-row__name">{profile.full_name || 'Sin nombre'}</span>
        <span className="user-row__id">{profile.id}</span>
      </div>
      <select className="input" value={role} onChange={(e) => handleRoleChange(e.target.value)} disabled={saving}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}

function UsersPageContent() {
  const { profiles, loading, error, refresh } = useProfiles()

  if (loading) return <Loading label="Cargando usuarios…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page page--narrow">
      <h2 className="section-title">Usuarios</h2>
      <p className="page-subtitle">Crear cuentas nuevas y asignar su rol (admin / tienda / fábrica).</p>

      <NewUserForm onCreated={refresh} />

      <div className="user-list">
        {profiles.map((p) => (
          <UserRow key={p.id} profile={p} onUpdated={refresh} />
        ))}
      </div>
    </div>
  )
}

export default function UsersPage() {
  return (
    <RequireRole allow={canManageUsers}>
      <UsersPageContent />
    </RequireRole>
  )
}
