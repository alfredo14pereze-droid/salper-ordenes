// Carga (o recarga) el catálogo de productos por cliente desde
// data/catalogo/catalogo_salper.json y sus fotos en data/catalogo/fotos/.
//
//   node scripts/seed_catalogo.mjs --simular   → solo dice qué haría, no escribe nada
//   node scripts/seed_catalogo.mjs             → carga de verdad
//
// Se puede correr las veces que haga falta: los clientes y las telas se
// reusan si ya existen, las fotos que ya están arriba no se vuelven a subir
// y cada producto se busca por cliente + nombre (RPC guardar_producto, V133),
// así que no se duplica nada. OJO: al recargar, lo que diga el JSON PISA lo
// que tenga ese producto en el catálogo — si alguien lo corrigió desde la
// app, hay que pasar esa corrección al JSON antes de recargar. Lo único que
// se conserva son las fotos subidas desde la app (logotipos y fotos extra).
//
// Necesita .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) y una cuenta
// ventas o admin_general en .env.capturas (CAPTURAS_EMAIL / CAPTURAS_PASSWORD).
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const JSON_PATH = path.join(RAIZ, 'data/catalogo/catalogo_salper.json')
const FOTOS_DIR = path.join(RAIZ, 'data/catalogo/fotos')
const BUCKET = 'order-photos'
const SIMULAR = process.argv.includes('--simular')

// Nombre de la ficha → nombre con el que el cliente YA existe en SALPER.
// Los que no estén aquí se buscan tal cual y, si no existen, se crean.
const ALIAS_CLIENTES = {
  'colegio domus': 'Domus',
  'instituto tricio': 'Tricio',
}

// Nombre de la ficha → tela del catálogo. El color no forma parte de la tela
// (va en el producto), por eso los tres piqué 50/50 son una sola.
const ALIAS_TELAS = {
  'pique rojo 50/50': 'Pique 50/50',
  'pique turquesa 50/50': 'Pique 50/50',
  'pique azul marino 50/50': 'Pique 50/50',
  'dubay xs': 'Dubay XS',
  'qatar 2': 'Qatar 2',
}

// Rango de la ficha → tallas de la app. La 16 no se usa: es la misma que XS.
const INFANTIL = ['2', '4', '6', '8', '10', '12', '14']
const ADULTO = ['XS', 'CH', 'M', 'L', 'XL']
const SERIES_TALLAS = {
  '2-XL': [...INFANTIL, ...ADULTO],
  '0-XL': ['0', '1', ...INFANTIL, ...ADULTO],
  '2-40': ['0', '1', ...INFANTIL, ...ADULTO], // decisión de Alfredo: se trata igual que 0-XL
  'S-5XL': ['CH', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
}

// Mismos colores que GARMENT_COLORS (src/lib/constants.js): si el color de la
// ficha es uno de estos se guarda escrito igual, para que el selector de
// "Color" lo reconozca en vez de caer en "Otro…".
const COLORES_APP = ['Blanco', 'Negro', 'Gris', 'Azul marino', 'Azul rey', 'Rojo', 'Verde bandera', 'Amarillo', 'Naranja', 'Vino']

const norm = (s) => String(s ?? '').trim().toLowerCase()
const limpio = (s) => (String(s ?? '').trim() === '' ? null : String(s).trim())

function colorDeApp(color) {
  const c = limpio(color)
  if (!c) return null
  return COLORES_APP.find((x) => norm(x) === norm(c)) ?? c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()
}

function leerEnv(archivo) {
  const ruta = path.join(RAIZ, archivo)
  if (!fs.existsSync(ruta)) return {}
  return Object.fromEntries(
    fs.readFileSync(ruta, 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
  )
}

function fallar(mensaje) {
  console.error(`\n✖ ${mensaje}`)
  process.exit(1)
}

const env = { ...leerEnv('.env'), ...leerEnv('.env.capturas'), ...process.env }
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) fallar('Falta .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.')
if (!env.CAPTURAS_EMAIL || !env.CAPTURAS_PASSWORD) fallar('Falta .env.capturas con CAPTURAS_EMAIL y CAPTURAS_PASSWORD.')

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data: sesion, error: authError } = await supabase.auth.signInWithPassword({ email: env.CAPTURAS_EMAIL, password: env.CAPTURAS_PASSWORD })
if (authError) fallar(`No se pudo iniciar sesión: ${authError.message}`)

const { data: perfil } = await supabase.from('profiles').select('role').eq('id', sesion.user.id).single()
if (!['ventas', 'admin_general'].includes(perfil?.role)) fallar(`La cuenta tiene rol "${perfil?.role}"; se necesita ventas o admin_general.`)

const { productos } = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))
console.log(`${SIMULAR ? 'SIMULACIÓN (no se escribe nada)' : 'CARGA REAL'} — ${productos.length} productos del JSON\n`)

const resumen = {
  clientes: { ligados: [], creados: [] },
  telas: { ligadas: [], creadas: [] },
  fotos: { subidas: 0, yaEstaban: 0 },
  productos: { insertados: [], actualizados: [] },
  tallasSinMapear: [],
  errores: [],
}

// ---------------------------------------------------------------- clientes
const { data: clientesBD, error: clientesError } = await supabase.from('clientes').select('id, nombre')
if (clientesError) fallar(clientesError.message)
const clientes = new Map() // nombre de la ficha (normalizado) → { id, nombre }

for (const nombreFicha of [...new Set(productos.map((p) => p.cliente))]) {
  const destino = ALIAS_CLIENTES[norm(nombreFicha)] ?? nombreFicha
  let cliente = clientesBD.find((c) => norm(c.nombre) === norm(destino))
  if (cliente) {
    resumen.clientes.ligados.push(nombreFicha === cliente.nombre ? cliente.nombre : `${nombreFicha} → ${cliente.nombre}`)
  } else if (SIMULAR) {
    cliente = { id: null, nombre: destino }
    resumen.clientes.creados.push(destino)
  } else {
    const { data, error } = await supabase
      .rpc('create_cliente', { p_nombre: destino, p_telefono: null, p_correo: null, p_tipo_orden: ['escolar'] })
      .single()
    if (error) fallar(`No se pudo crear el cliente "${destino}": ${error.message}`)
    cliente = data
    resumen.clientes.creados.push(destino)
  }
  clientes.set(norm(nombreFicha), cliente)
}

// ------------------------------------------------------------------- telas
const { data: telasBD, error: telasError } = await supabase.from('telas').select('id, nombre')
if (telasError) fallar(telasError.message)
const telas = new Map() // nombre de la ficha (normalizado) → { id, nombre }

// Una ficha puede traer dos telas separadas por coma ("QATAR 2, DUBAY XS").
const telasDeFicha = (p) => String(p.tela ?? '').split(',').map((t) => t.trim()).filter(Boolean)

for (const nombreFicha of [...new Set(productos.flatMap(telasDeFicha))]) {
  const destino = ALIAS_TELAS[norm(nombreFicha)] ?? nombreFicha
  let tela = telasBD.find((t) => norm(t.nombre) === norm(destino))
  if (tela) {
    resumen.telas.ligadas.push(`${nombreFicha} → ${tela.nombre}`)
  } else if (SIMULAR) {
    tela = { id: null, nombre: destino }
    telasBD.push(tela)
    resumen.telas.creadas.push(destino)
  } else {
    const { data, error } = await supabase.rpc('create_tela', { p_nombre: destino, p_unidad: null }).single()
    if (error) fallar(`No se pudo crear la tela "${destino}": ${error.message}`)
    tela = data
    telasBD.push(tela)
    resumen.telas.creadas.push(destino)
  }
  telas.set(norm(nombreFicha), tela)
}

// ------------------------------------------------------------------- fotos
// Se conserva el nombre del archivo: productos/<clienteId>/<archivo>.jpg
const fotosEnStorage = new Map() // clienteId → Set de nombres ya subidos

async function subirFoto(clienteId, archivo) {
  const ruta = path.join(FOTOS_DIR, archivo)
  if (!fs.existsSync(ruta)) throw new Error(`no existe el archivo ${archivo}`)
  if (!clienteId) {
    resumen.fotos.subidas += 1 // simulación con cliente que todavía no existe
    return { url: '(simulación)', path: `productos/<cliente nuevo>/${archivo}` }
  }

  if (!fotosEnStorage.has(clienteId)) {
    const { data, error } = await supabase.storage.from(BUCKET).list(`productos/${clienteId}`, { limit: 1000 })
    if (error) throw new Error(error.message)
    fotosEnStorage.set(clienteId, new Set((data || []).map((f) => f.name)))
  }

  const destino = `productos/${clienteId}/${archivo}`
  if (fotosEnStorage.get(clienteId).has(archivo)) {
    resumen.fotos.yaEstaban += 1
  } else {
    if (!SIMULAR) {
      const { error } = await supabase.storage.from(BUCKET).upload(destino, fs.readFileSync(ruta), { contentType: 'image/jpeg' })
      if (error) throw new Error(error.message)
      fotosEnStorage.get(clienteId).add(archivo)
    }
    resumen.fotos.subidas += 1
  }
  return { url: supabase.storage.from(BUCKET).getPublicUrl(destino).data.publicUrl, path: destino }
}

// --------------------------------------------------------------- productos
const pendientes = new Map() // cliente → [{ nombre, notas[] }]

for (const p of productos) {
  const cliente = clientes.get(norm(p.cliente))
  try {
    const notas = [...(p.revisar || [])]

    let color = colorDeApp(p.color)
    if (!color && limpio(p.color_sugerido_de_foto)) {
      color = colorDeApp(p.color_sugerido_de_foto)
      notas.push('Color tomado de la foto, sin confirmar')
    } else if (!color) {
      notas.push('Falta el color')
    }

    let tallas = []
    if (limpio(p.tallas_rango)) {
      tallas = SERIES_TALLAS[p.tallas_rango.trim().toUpperCase()] || []
      if (tallas.length === 0) {
        resumen.tallasSinMapear.push(`${p.nombre}: "${p.tallas_rango}"`)
        notas.push(`Rango de tallas "${p.tallas_rango}" sin convertir`)
      }
    } else {
      notas.push('Faltan las tallas')
    }

    const [telaPrincipal, ...telasExtra] = telasDeFicha(p)
    const tela = telaPrincipal ? telas.get(norm(telaPrincipal)) : null

    const especificaciones = Object.fromEntries(
      Object.entries({
        manga: limpio(p.manga),
        vivos: limpio(p.vivos),
        cuello: limpio(p.cuello),
        punos: limpio(p.punos),
        bies: limpio(p.bies),
        hilo: limpio(p.hilo),
        tecnicas: p.tecnicas?.length ? p.tecnicas : null,
        proveedor: limpio(p.proveedor),
        observaciones: limpio(p.observaciones),
        tela_extra: telasExtra.length ? telasExtra.map((t) => telas.get(norm(t))?.nombre ?? t).join(', ') : null,
        color_sugerido_de_foto: limpio(p.color_sugerido_de_foto),
        ficha: p.ficha ?? null,
      }).filter(([, v]) => v !== null),
    )

    const bordados = (p.bordados || [])
      .map((b) => ({ ubicacion: limpio(b.ubicacion) ?? '', descripcion: limpio(b.descripcion) ?? '' }))
      .filter((b) => b.ubicacion || b.descripcion)

    const fotos = []
    for (const archivo of p.fotos || []) fotos.push(await subirFoto(cliente.id, archivo))

    let yaExiste = false
    if (cliente.id) {
      const { data, error } = await supabase
        .from('productos')
        .select('id, bordados, fotos')
        .eq('cliente_id', cliente.id)
        .ilike('nombre', p.nombre.trim())
        .order('created_at')
      if (error) throw new Error(error.message)
      yaExiste = (data || []).length > 0
      // Lo que se subió desde la app y el JSON no conoce se conserva: la foto
      // del logotipo de cada bordado (por ubicación) y las fotos extra.
      const actual = data?.[0]
      for (const b of bordados) {
        const previo = (actual?.bordados || []).find((x) => norm(x.ubicacion) === norm(b.ubicacion) && x.foto_url)
        if (previo) Object.assign(b, { foto_url: previo.foto_url, foto_path: previo.foto_path })
      }
      for (const f of actual?.fotos || []) {
        if (!fotos.some((x) => x.path === f.path)) fotos.push(f)
      }
    }

    if (!SIMULAR) {
      const { error } = await supabase
        .rpc('guardar_producto', {
          p_cliente_id: cliente.id,
          p_nombre: p.nombre,
          p_garment: limpio(p.prenda),
          p_color: color,
          p_pantone: null,
          p_tela_id: tela?.id ?? null,
          p_especificaciones: especificaciones,
          p_bordados: bordados,
          p_tallas: tallas,
          p_tallas_rango: limpio(p.tallas_rango),
          p_fotos: fotos,
          p_pendiente_validar: notas.length > 0,
          p_notas_validacion: notas.join('; '),
        })
        .single()
      if (error) throw new Error(error.message)
    }

    resumen.productos[yaExiste ? 'actualizados' : 'insertados'].push(p.nombre)
    if (notas.length > 0) {
      if (!pendientes.has(cliente.nombre)) pendientes.set(cliente.nombre, [])
      pendientes.get(cliente.nombre).push({ nombre: p.nombre, notas })
    }
  } catch (error) {
    resumen.errores.push(`${p.nombre}: ${error.message}`)
  }
}

await supabase.auth.signOut()

// ----------------------------------------------------------------- resumen
const lista = (items) => (items.length ? items.map((i) => `\n     · ${i}`).join('') : ' ninguno')
const totalPendientes = [...pendientes.values()].reduce((n, l) => n + l.length, 0)

console.log('RESUMEN')
console.log(`  Clientes ligados (${resumen.clientes.ligados.length}):${lista(resumen.clientes.ligados)}`)
console.log(`  Clientes creados (${resumen.clientes.creados.length}):${lista(resumen.clientes.creados)}`)
console.log(`  Telas ligadas (${resumen.telas.ligadas.length}):${lista(resumen.telas.ligadas)}`)
console.log(`  Telas creadas (${resumen.telas.creadas.length}):${lista(resumen.telas.creadas)}`)
console.log(`  Fotos subidas: ${resumen.fotos.subidas} · ya estaban: ${resumen.fotos.yaEstaban}`)
console.log(`  Productos insertados: ${resumen.productos.insertados.length} · actualizados: ${resumen.productos.actualizados.length}`)
console.log(`  Rangos de tallas sin convertir (${resumen.tallasSinMapear.length}):${lista(resumen.tallasSinMapear)}`)
console.log(`  Errores (${resumen.errores.length}):${lista(resumen.errores)}`)

console.log(`\nCHECKLIST DE PENDIENTES POR VALIDAR (${totalPendientes} de ${productos.length} productos)`)
for (const [cliente, items] of pendientes) {
  console.log(`\n  ${cliente} (${items.length})`)
  for (const item of items) {
    console.log(`    [ ] ${item.nombre}`)
    for (const nota of item.notas) console.log(`          - ${nota}`)
  }
}

if (resumen.errores.length > 0) process.exit(1)
