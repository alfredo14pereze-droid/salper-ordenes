// Edge Function: admin-create-user
//
// Gestiona usuarios (auth + su perfil) — SOLO admin_general puede llamar
// esto. La service role key nunca sale de este servidor: el navegador
// solo manda su propio token de sesión para que verifiquemos quién es y
// si tiene permiso.
//
// Desde V23 esta función dejó de ser solo "crear" — ahora soporta varias
// acciones vía el campo `action` del body (default 'create' si se omite,
// por compatibilidad con el frontend anterior a V23):
//   - 'create': da de alta un usuario nuevo (auth + perfil con rol).
//   - 'update': edita nombre y/o correo de un usuario existente.
//   - 'suspend' / 'unsuspend': banea/desbanea el login en Supabase Auth
//     (ban_duration) y refleja el estado en profiles.suspended_at (columna
//     espejo, solo para mostrar "Suspendido" en la UI sin tener que
//     consultar auth.users).
//   - 'delete': borra el usuario de auth.users — profiles.id tiene
//     `on delete cascade` hacia auth.users(id), así que el perfil se borra
//     solo, sin necesidad de un segundo delete.
//
// Desplegada vía el editor del Dashboard de Supabase (Edge Functions →
// admin-create-user). Este archivo es la copia de respaldo/documentación
// en el repo — si se edita aquí, hay que volver a pegarlo y desplegarlo
// desde el Dashboard (o usar `supabase functions deploy` con la CLI).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const VALID_ROLES = [
  'ventas', 'contabilidad', 'admin_tienda',
  'corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica',
  'admin_general',
]

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const jsonResponse = (body, status) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Falta autenticación.' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    // Cliente con la sesión de quien llama, solo para saber quién es.
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser()
    if (userError || !user) {
      return jsonResponse({ error: 'No se pudo verificar tu sesión.' }, 401)
    }

    // Cliente con la service role, para checar el perfil y operar sobre usuarios.
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || callerProfile?.role !== 'admin_general') {
      return jsonResponse({ error: 'Solo un administrador puede gestionar usuarios.' }, 403)
    }

    const body = await req.json()
    const action = body.action || 'create'

    if (action === 'create') {
      const { email, password, password_confirm, full_name, role } = body

      if (!email || !password || !full_name || !role) {
        return jsonResponse({ error: 'Faltan datos: email, password, full_name, role.' }, 400)
      }
      if (!VALID_ROLES.includes(role)) {
        return jsonResponse({ error: 'Rol inválido.' }, 400)
      }
      if (String(password).length < 6) {
        return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400)
      }
      // Espejo de la validación de UsersPage.jsx — por si alguien llama a
      // este endpoint directo, saltándose el frontend.
      if (password !== password_confirm) {
        return jsonResponse({ error: 'Las contraseñas no coinciden.' }, 400)
      }

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role },
      })

      if (createError) {
        return jsonResponse({ error: createError.message }, 400)
      }

      return jsonResponse({ user: created.user }, 200)
    }

    if (action === 'update') {
      const { user_id, full_name, email } = body
      if (!user_id) {
        return jsonResponse({ error: 'Falta user_id.' }, 400)
      }
      const authUpdate = {}
      if (email) authUpdate.email = email
      if (full_name) authUpdate.user_metadata = { full_name }

      if (Object.keys(authUpdate).length > 0) {
        const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(user_id, authUpdate)
        if (updateAuthError) {
          return jsonResponse({ error: updateAuthError.message }, 400)
        }
      }
      if (full_name) {
        const { error: updateProfileError } = await adminClient
          .from('profiles')
          .update({ full_name })
          .eq('id', user_id)
        if (updateProfileError) {
          return jsonResponse({ error: updateProfileError.message }, 400)
        }
      }
      return jsonResponse({ ok: true }, 200)
    }

    if (action === 'suspend' || action === 'unsuspend') {
      const { user_id } = body
      if (!user_id) {
        return jsonResponse({ error: 'Falta user_id.' }, 400)
      }
      // No se puede suspender a sí mismo — evita que el único admin_general
      // se bloquee sin querer.
      if (user_id === user.id) {
        return jsonResponse({ error: 'No puedes suspenderte a ti mismo.' }, 400)
      }
      const banDuration = action === 'suspend' ? '876000h' : 'none' // ~100 años ≈ indefinido
      const { error: banError } = await adminClient.auth.admin.updateUserById(user_id, { ban_duration: banDuration })
      if (banError) {
        return jsonResponse({ error: banError.message }, 400)
      }
      const { error: profileError2 } = await adminClient
        .from('profiles')
        .update({ suspended_at: action === 'suspend' ? new Date().toISOString() : null })
        .eq('id', user_id)
      if (profileError2) {
        return jsonResponse({ error: profileError2.message }, 400)
      }
      return jsonResponse({ ok: true }, 200)
    }

    if (action === 'delete') {
      const { user_id } = body
      if (!user_id) {
        return jsonResponse({ error: 'Falta user_id.' }, 400)
      }
      if (user_id === user.id) {
        return jsonResponse({ error: 'No puedes eliminarte a ti mismo.' }, 400)
      }
      // profiles.id -> auth.users(id) ON DELETE CASCADE: el perfil se
      // borra solo, no hace falta un segundo delete.
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id)
      if (deleteError) {
        return jsonResponse({ error: deleteError.message }, 400)
      }
      return jsonResponse({ ok: true }, 200)
    }

    return jsonResponse({ error: `Acción desconocida: ${action}` }, 400)
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500)
  }
})
