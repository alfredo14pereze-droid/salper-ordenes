// V207 — CRM de prospectos: catálogos, normalización anti-duplicados y
// lectura del CSV de importación. Ver supabase/schema_v207_crm_prospectos.sql.

// Estatus del prospecto, en el orden del embudo. Rojo/verde solo para
// ganado/perdido (son indicadores de estado, regla de identidad visual).
export const CRM_ESTATUS = [
  { key: 'nuevo', label: 'Nuevo', dot: '#94a3b8', bg: '#f1f5f9', fg: '#334155' },
  { key: 'catalogo_enviado', label: 'Catálogo enviado', dot: '#f5b301', bg: '#fef3c7', fg: '#78350f' },
  { key: 'en_conversacion', label: 'En conversación', dot: '#f59e0b', bg: '#fde68a', fg: '#78350f' },
  { key: 'visita_reunion', label: 'Visita / reunión', dot: '#f97316', bg: '#fdba74', fg: '#7c2d12' },
  { key: 'cotizado', label: 'Cotizado', dot: '#c2410c', bg: '#f97316', fg: '#ffffff' },
  { key: 'ganado', label: 'Ganado', dot: '#15803d', bg: '#15803d', fg: '#ffffff' },
  { key: 'perdido', label: 'Perdido', dot: '#b91c1c', bg: '#b91c1c', fg: '#ffffff' },
  { key: 'en_pausa', label: 'En pausa', dot: '#64748b', bg: '#e2e8f0', fg: '#475569' },
]
export const ESTATUS_POR_KEY = Object.fromEntries(CRM_ESTATUS.map((e) => [e.key, e]))
export const estatusLabel = (k) => ESTATUS_POR_KEY[k]?.label || k || '—'

export const CRM_SEGMENTOS = [
  { key: 'industrial', label: 'Industrial' },
  { key: 'salud', label: 'Salud' },
  { key: 'escuela', label: 'Escuela' },
  { key: 'corporativo', label: 'Corporativo' },
  { key: 'alimentos', label: 'Alimentos' },
  { key: 'transporte', label: 'Transporte' },
  { key: 'otro', label: 'Otro' },
]
export const segmentoLabel = (k) => CRM_SEGMENTOS.find((s) => s.key === k)?.label || '—'

export const CRM_TIPOS_ACTIVIDAD = [
  { key: 'llamada', label: 'Llamada', icono: '📞' },
  { key: 'correo', label: 'Correo', icono: '✉️' },
  { key: 'whatsapp', label: 'WhatsApp', icono: '💬' },
  { key: 'visita', label: 'Visita', icono: '🚗' },
  { key: 'reunion', label: 'Reunión', icono: '🤝' },
  { key: 'videollamada', label: 'Videollamada', icono: '🎥' },
  { key: 'nota', label: 'Nota', icono: '📝' },
]
export const tipoActividad = (k) => CRM_TIPOS_ACTIVIDAD.find((t) => t.key === k) || { key: k, label: k, icono: '•' }

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Misma regla que public.crm_norm_empresa (SQL): sin acentos, minúsculas, sin
// puntuación, sin "S.A. de C.V." / "S. de R.L." / "S.A.P.I." / "S.C." / "A.C."
// al final, espacios simples. Si se cambia una, cambiar la otra.
export function normEmpresa(s) {
  let t = String(s ?? '').toLowerCase()
  t = t.replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i').replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n')
  t = t.replace(/[^a-z0-9 ]/g, ' ')
  t = t.replace(/(\s(s\s*a\s*p\s*i|s\s*a|s\s*de\s*r\s*l|s\s*c|a\s*c)(\s*de\s*c\s*v)?)\s*$/, '')
  return t.replace(/\s+/g, ' ').trim()
}

// Para el buscador: sin acentos y en minúsculas.
export function normTexto(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// ¿Está abierto? (todo menos ganado y perdido)
export const estaAbierto = (estatus) => estatus !== 'ganado' && estatus !== 'perdido'

// ---------------------------------------------------------------------
// Importación CSV
// ---------------------------------------------------------------------
export const CSV_COLUMNAS = [
  'empresa', 'ubicacion', 'segmento', 'estatus', 'contacto_nombre', 'contacto_puesto',
  'telefono', 'correo', 'actividad_fecha', 'actividad_tipo', 'actividad_nota',
  'seguimiento_fecha', 'seguimiento_nota',
]

// Lector de CSV (comas o punto y coma, comillas dobles, saltos de línea
// dentro de comillas). Regresa arreglo de arreglos.
export function parseCsv(texto) {
  const txt = String(texto ?? '').replace(/^﻿/, '')
  const primera = txt.split(/\r?\n/, 1)[0] || ''
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ','
  const filas = []
  let fila = []
  let campo = ''
  let enComillas = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (enComillas) {
      if (c === '"') {
        if (txt[i + 1] === '"') {
          campo += '"'
          i++
        } else enComillas = false
      } else campo += c
    } else if (c === '"') enComillas = true
    else if (c === sep) {
      fila.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && txt[i + 1] === '\n') i++
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else campo += c
  }
  if (campo !== '' || fila.length) {
    fila.push(campo)
    filas.push(fila)
  }
  return filas.filter((f) => f.some((v) => String(v).trim() !== ''))
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
function fechaValida(s) {
  if (!FECHA_RE.test(s)) return false
  const d = new Date(s + 'T00:00:00')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// Texto libre del Excel → clave del catálogo (por clave o por etiqueta, sin
// acentos ni mayúsculas). Si no se reconoce se deja tal cual y el servidor
// lo manda a su valor por omisión ('nuevo' / 'otro' / 'nota').
function aClave(valor, catalogo, extras = {}) {
  const v = normTexto(valor).replace(/[\s/_-]+/g, ' ').trim()
  if (!v) return ''
  for (const it of catalogo) {
    if (v === it.key.replace(/_/g, ' ') || v === normTexto(it.label).replace(/[\s/_-]+/g, ' ').trim()) return it.key
  }
  return extras[v] || valor
}

// Convierte el texto del CSV en filas (objetos) + errores por renglón.
export function leerCsvProspectos(texto) {
  const filas = parseCsv(texto)
  if (filas.length === 0) return { filas: [], errores: ['El archivo está vacío.'], faltan: [] }
  const encabezados = filas[0].map((h) => normTexto(h).replace(/\s+/g, '_'))
  const faltan = CSV_COLUMNAS.filter((c) => !encabezados.includes(c))
  if (faltan.includes('empresa')) {
    return { filas: [], errores: ['No encontré la columna "empresa". Revisa que la primera fila tenga los encabezados.'], faltan }
  }
  const errores = []
  const out = []
  filas.slice(1).forEach((valores, i) => {
    const renglon = i + 2
    const o = {}
    CSV_COLUMNAS.forEach((c) => {
      const idx = encabezados.indexOf(c)
      o[c] = idx >= 0 ? String(valores[idx] ?? '').trim() : ''
    })
    if (!o.empresa) {
      errores.push(`Renglón ${renglon}: no tiene empresa, se va a saltar.`)
      return
    }
    // "Catálogo enviado" / "catalogo_enviado" / "CATALOGO ENVIADO" → catalogo_enviado
    o.estatus = aClave(o.estatus, CRM_ESTATUS, { 'visita': 'visita_reunion', 'reunion': 'visita_reunion', 'pausa': 'en_pausa' })
    o.segmento = aClave(o.segmento, CRM_SEGMENTOS, { 'educacion': 'escuela', 'escolar': 'escuela', 'hospital': 'salud' })
    o.actividad_tipo = aClave(o.actividad_tipo, CRM_TIPOS_ACTIVIDAD, { 'whats': 'whatsapp', 'wa': 'whatsapp', 'email': 'correo', 'mail': 'correo', 'telefono': 'llamada' })
    for (const c of ['actividad_fecha', 'seguimiento_fecha']) {
      if (o[c] && !fechaValida(o[c])) {
        errores.push(`Renglón ${renglon}: la fecha "${o[c]}" (${c === 'actividad_fecha' ? 'fecha de la actividad' : 'fecha del seguimiento'}) no tiene el formato AAAA-MM-DD; se dejó vacía.`)
        o[c] = ''
      }
    }
    out.push(o)
  })
  return { filas: out, errores, faltan }
}

// Vista previa: lo mismo que hará crm_importar en el servidor (misma
// agrupación y mismos "no repetir"), contra lo que ya existe en el CRM.
// existentes = { empresas: [{id, nombre}], contactos: [{empresa_id, nombre, correo}] }
export function previaImportacion(filas, existentes = { empresas: [], contactos: [] }) {
  const empPorNorm = new Map()
  for (const e of existentes.empresas) {
    const n = normEmpresa(e.nombre)
    if (!empPorNorm.has(n)) empPorNorm.set(n, { id: e.id, nombre: e.nombre, existe: true })
  }
  const contactosPorEmp = new Map()
  for (const c of existentes.contactos) {
    if (!contactosPorEmp.has(c.empresa_id)) contactosPorEmp.set(c.empresa_id, [])
    contactosPorEmp.get(c.empresa_id).push({ nombre: c.nombre, correo: c.correo })
  }
  const grupos = new Map() // norm -> resumen
  let nuevas = 0
  let contactos = 0
  let actividades = 0
  let seguimientos = 0
  const vistosAct = new Set()
  const vistosSeg = new Set()
  for (const f of filas) {
    const n = normEmpresa(f.empresa)
    if (!n) continue
    let g = grupos.get(n)
    if (!g) {
      const ex = empPorNorm.get(n)
      g = { norm: n, nombre: ex ? ex.nombre : f.empresa, existe: !!ex, key: ex ? ex.id : 'n:' + n, contactos: 0, actividades: 0, seguimientos: 0, nombresCsv: new Set() }
      if (!ex) nuevas++
      grupos.set(n, g)
      if (!contactosPorEmp.has(g.key)) contactosPorEmp.set(g.key, [])
    }
    g.nombresCsv.add(f.empresa)
    const correo = f.correo.toLowerCase()
    if (f.contacto_nombre || correo) {
      const lista = contactosPorEmp.get(g.key)
      const ya = lista.some((c) => (correo ? (c.correo || '').toLowerCase() === correo : normTexto(c.nombre) === normTexto(f.contacto_nombre)))
      if (!ya) {
        lista.push({ nombre: f.contacto_nombre || correo, correo })
        g.contactos++
        contactos++
      }
    }
    if (f.actividad_fecha) {
      const tipo = CRM_TIPOS_ACTIVIDAD.some((t) => t.key === f.actividad_tipo.toLowerCase()) ? f.actividad_tipo.toLowerCase() : 'nota'
      const k = [g.key, f.actividad_fecha, tipo, f.actividad_nota].join('|')
      if (!vistosAct.has(k)) {
        vistosAct.add(k)
        g.actividades++
        actividades++
      }
    }
    if (f.seguimiento_fecha) {
      const k = [g.key, f.seguimiento_fecha, f.seguimiento_nota].join('|')
      if (!vistosSeg.has(k)) {
        vistosSeg.add(k)
        g.seguimientos++
        seguimientos++
      }
    }
  }
  const lista = [...grupos.values()].map((g) => ({ ...g, nombresCsv: [...g.nombresCsv] })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return { nuevas, existentes: lista.length - nuevas, contactos, actividades, seguimientos, grupos: lista }
}

// Atajos de fecha (YYYY-MM-DD) a partir de hoy.
export function sumarDias(fechaIso, dias) {
  const d = new Date(fechaIso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function formatoMonto(n) {
  if (n === null || n === undefined || n === '') return '—'
  return Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
}
