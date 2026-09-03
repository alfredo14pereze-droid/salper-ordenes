// Edge Function: admin-create-user
//
// Crea un usuario nuevo (auth + su perfil con rol) — SOLO un admin puede
// llamar esto. La service role key nunca sale de este servidor: el
// navegador solo manda su propio token de sesión para que verifiquemos
// quién es y si tiene permiso.
//
// Desplegada vía el editor del Dashboard de Supabase (Edge Functions →
// admin-create-user). Este archivo es la copia de respaldo/documentación
// en el repo — si se edita aquí, hay que volver a pegarlo y desplegarlo
// desde el Dashboard (o usar `supabase functions deploy` con la CLI).
import { createClient } from 'jsr:@supabase/supabase-js@2'

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

    // Cliente con la service role, para checar el perfil y crear el usuario.
    // Requiere que public.profiles tenga GRANT SELECT para service_role
    // (ver supabase/schema_v4_auth.sql, sección de fix de permisos).
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || callerProfile?.role !== 'admin') {
      return jsonResponse({ error: 'Solo un administrador puede crear usuarios.' }, 403)
    }

    const { email, password, password_confirm, full_name, role } = await req.json()

    if (!email || !password || !full_name || !role) {
      return jsonResponse({ error: 'Faltan datos: email, password, full_name, role.' }, 400)
    }
    if (!['admin', 'tienda', 'fabrica'].includes(role)) {
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
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500)
  }
})
