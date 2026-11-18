import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

// POST /api/cotizacion — formulario de cotización de la página pública.
// 1) valida los campos, 2) honeypot (`sitio_web` lleno = bot: se responde
// "ok" sin guardar nada), 3) límite por IP, 4) inserta en cotizaciones_web
// con la service role key (solo existe aquí, en el servidor), 5) avisa a
// ventas por correo: con Resend (API HTTP) si hay RESEND_API_KEY; si no, por
// SMTP. Si faltan las variables o el correo falla, la cotización YA quedó
// guardada y el usuario ve éxito igual (el error queda en los logs).
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   VITE_SUPABASE_URL           (ya existe)
//   SUPABASE_SERVICE_ROLE_KEY   llave secreta de Supabase
//   RESEND_API_KEY              llave de Resend (secreta) — opción principal
//   COTIZACION_EMAIL_FROM       remitente de un dominio verificado en Resend,
//                               p. ej. avisos@gruposalper.com
//   COTIZACION_EMAIL_TO         p. ej. ventas@gruposalper.com (varios: separados por coma)
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  (alternativa sin Resend; Zoho
//                               gratis NO permite SMTP: 554 Access Restricted)

const LIMITE_ENVIOS = 5
const VENTANA_MIN = 15
const ESTADOS_CANTIDAD = ['Menos de 50', '50 a 200', '200 a 500', 'Más de 500']
const PERSONALIZACION = ['Bordado', 'Sublimación', 'Serigrafía']

const texto = (v, max) => {
  if (typeof v !== 'string') return ''
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max)
}
const lista = (v, maxItems, maxLen) =>
  Array.isArray(v) ? [...new Set(v.map((x) => texto(x, maxLen)).filter(Boolean))].slice(0, maxItems) : []

export function limpiar(body) {
  const b = body && typeof body === 'object' ? body : {}
  const fecha = texto(b.fecha_deseada, 10)
  return {
    nombre: texto(b.nombre, 120),
    empresa: texto(b.empresa, 160) || null,
    telefono: texto(b.telefono, 30),
    correo: texto(b.correo, 160).toLowerCase(),
    sector: texto(b.sector, 80) || null,
    productos: lista(b.productos, 30, 120),
    cantidad_aprox: ESTADOS_CANTIDAD.includes(b.cantidad_aprox) ? b.cantidad_aprox : null,
    personalizacion: lista(b.personalizacion, 3, 40).filter((p) => PERSONALIZACION.includes(p)),
    fecha_deseada: /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(Date.parse(fecha)) ? fecha : null,
    mensaje: texto(b.mensaje, 2000) || null,
  }
}

export function validar(c, acepta) {
  if (c.nombre.length < 2) return 'Escribe tu nombre.'
  if (c.telefono.replace(/\D/g, '').length < 10) return 'Escribe un teléfono de 10 dígitos.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.correo)) return 'Escribe un correo válido.'
  if (acepta !== true) return 'Necesitamos que aceptes el aviso de privacidad.'
  return null
}

function ipDe(req) {
  const fwd = req.headers['x-forwarded-for']
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'desconocida'
}

const escapar = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

function filasCorreo(c) {
  return [
    ['Nombre', c.nombre],
    ['Empresa', c.empresa],
    ['Teléfono', c.telefono],
    ['Correo', c.correo],
    ['Sector', c.sector],
    ['Productos', c.productos.join(', ')],
    ['Cantidad aproximada', c.cantidad_aprox],
    ['Personalización', c.personalizacion.join(', ')],
    ['Fecha deseada', c.fecha_deseada],
    ['Mensaje', c.mensaje],
  ].filter(([, v]) => v)
}

function armarCorreo(c) {
  const filas = filasCorreo(c)
  const pie = 'Llegó desde salperdeportes.com. Está en el sistema: Cotizaciones web.'
  return {
    subject: `Nueva cotización web: ${c.nombre}${c.empresa ? ` (${c.empresa})` : ''}`,
    text: filas.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\n${pie}`,
    html:
      '<h2 style="font-family:sans-serif;color:#0f2a44">Nueva solicitud de cotización</h2>' +
      '<table style="font-family:sans-serif;border-collapse:collapse">' +
      filas
        .map(
          ([k, v]) =>
            `<tr><td style="padding:6px 12px 6px 0;color:#4b5868;vertical-align:top"><b>${escapar(k)}</b></td>` +
            `<td style="padding:6px 0;white-space:pre-wrap">${escapar(v)}</td></tr>`
        )
        .join('') +
      `</table><p style="font-family:sans-serif;color:#4b5868">${pie}</p>`,
  }
}

const destinatarios = (v) =>
  String(v || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

async function porResend(c, correo, { RESEND_API_KEY, COTIZACION_EMAIL_FROM, COTIZACION_EMAIL_TO }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Página SALPER <${COTIZACION_EMAIL_FROM || 'onboarding@resend.dev'}>`,
      to: destinatarios(COTIZACION_EMAIL_TO),
      reply_to: c.correo,
      ...correo,
    }),
  })
  if (!r.ok) {
    const detalle = await r.text().catch(() => '')
    throw new Error(`Resend ${r.status}: ${detalle.slice(0, 300)}`)
  }
}

async function porSmtp(c, correo, { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, COTIZACION_EMAIL_TO, COTIZACION_EMAIL_FROM }) {
  const puerto = Number(SMTP_PORT)
  const transporte = nodemailer.createTransport({
    host: SMTP_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
  await transporte.sendMail({
    from: `"Página SALPER" <${COTIZACION_EMAIL_FROM || SMTP_USER}>`,
    to: destinatarios(COTIZACION_EMAIL_TO),
    replyTo: c.correo,
    ...correo,
  })
}

export async function mandarCorreo(c, env = process.env) {
  if (!env.COTIZACION_EMAIL_TO) {
    console.warn('[cotizacion] Falta COTIZACION_EMAIL_TO: se guardó sin mandar correo.')
    return false
  }
  const correo = armarCorreo(c)
  if (env.RESEND_API_KEY) {
    await porResend(c, correo, env)
    return 'resend'
  }
  if (env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS) {
    await porSmtp(c, correo, env)
    return 'smtp'
  }
  console.warn('[cotizacion] Falta RESEND_API_KEY (o SMTP_*): se guardó sin mandar correo.')
  return false
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método no permitido.' })
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = {}
    }
  }

  // Honeypot: un bot llenó el campo oculto. Se le responde como si nada.
  if (body && typeof body.sitio_web === 'string' && body.sitio_web.trim() !== '') {
    return res.status(200).json({ ok: true })
  }

  const c = limpiar(body)
  const error = validar(c, body?.acepta_aviso)
  if (error) return res.status(400).json({ error })

  const url = process.env.VITE_SUPABASE_URL
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !llave) {
    console.error('[cotizacion] Falta VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
    return res.status(500).json({ error: 'No pudimos recibir tu solicitud. Escríbenos por WhatsApp.' })
  }
  const supabase = createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false } })
  const ipHash = createHmac('sha256', llave).update(ipDe(req)).digest('hex').slice(0, 32)

  // Límite simple por IP: máximo LIMITE_ENVIOS en VENTANA_MIN minutos.
  const desde = new Date(Date.now() - VENTANA_MIN * 60 * 1000).toISOString()
  const { count, error: errCuenta } = await supabase
    .from('cotizaciones_web')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', desde)
  if (errCuenta) console.error('[cotizacion] error al contar envíos:', errCuenta.message)
  if ((count || 0) >= LIMITE_ENVIOS) {
    return res.status(429).json({ error: 'Recibimos varias solicitudes seguidas. Intenta en unos minutos o escríbenos por WhatsApp.' })
  }

  const { error: errInsert } = await supabase.from('cotizaciones_web').insert({ ...c, ip_hash: ipHash, origen: 'web' })
  if (errInsert) {
    console.error('[cotizacion] error al guardar:', errInsert.message)
    return res.status(500).json({ error: 'No pudimos recibir tu solicitud. Intenta de nuevo o escríbenos por WhatsApp.' })
  }

  try {
    const via = await mandarCorreo(c)
    if (via) console.log(`[cotizacion] aviso enviado por ${via}`)
  } catch (e) {
    console.error('[cotizacion] se guardó, pero falló el correo:', e?.message || e)
  }

  return res.status(200).json({ ok: true })
}
