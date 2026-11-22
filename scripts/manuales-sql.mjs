// Arma el SQL de datos de una sección de Manuales a partir de los .md de
// supabase/manuales/<carpeta>/ (V196 + V214).
//
// Uso:   node scripts/manuales-sql.mjs ordenes [fecha]
// Salida: supabase/datos_<fecha>_manuales_<carpeta>.sql
//
// Cada carpeta lleva:
//   _seccion.json  → { "nombre", "descripcion", "icono" }
//   N_<clave>.md   → front matter (clave, titulo) + contenido en markdown.
//                    N es el orden dentro de la sección.
//
// El SQL crea la sección si no existe e inserta cada manual SOLO si su clave
// todavía no está (se puede correr dos veces sin duplicar). Nunca actualiza
// ni borra manuales existentes: si ya se cargó uno y hay que corregirlo,
// se corrige con el editor de la app o con un UPDATE aparte.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const carpeta = process.argv[2]
const fecha = process.argv[3] || new Date().toISOString().slice(0, 10)
if (!carpeta) {
  console.error('Uso: node scripts/manuales-sql.mjs <carpeta> [fecha]')
  process.exit(1)
}
const dir = join(raiz, 'supabase', 'manuales', carpeta)
const seccion = JSON.parse(readFileSync(join(dir, '_seccion.json'), 'utf8'))

export function leerManual(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) throw new Error('Falta el front matter (--- clave/titulo ---)')
  const meta = Object.fromEntries(
    m[1].split('\n').filter(Boolean).map((l) => {
      const i = l.indexOf(':')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
  )
  if (!meta.clave || !meta.titulo) throw new Error('El front matter necesita clave y titulo')
  return { ...meta, contenido: m[2].trim() + '\n' }
}

// Texto entre $tag$ … $tag$ (sin escapar nada). Revisa que el tag no aparezca adentro.
function dolar(texto, tag) {
  if (texto.includes(`$${tag}$`)) throw new Error(`El texto contiene $${tag}$`)
  return `$${tag}$${texto}$${tag}$`
}

const archivos = readdirSync(dir).filter((f) => /^\d+_.+\.md$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b))
const manuales = archivos.map((f) => ({ orden: parseInt(f), ...leerManual(readFileSync(join(dir, f), 'utf8')) }))
const claves = new Set()
for (const x of manuales) {
  if (claves.has(x.clave)) throw new Error(`Clave repetida: ${x.clave}`)
  claves.add(x.clave)
}

const filas = manuales
  .map((x) => `      (${x.orden}, ${dolar(x.clave, 'c')}, ${dolar(x.titulo, 't')},\n${dolar(x.contenido, 'man')})`)
  .join(',\n')

const sql = `-- =====================================================================
-- Datos ${fecha} — Manuales: sección "${seccion.nombre}" (${manuales.length} manuales)
-- =====================================================================
-- Generado con: node scripts/manuales-sql.mjs ${carpeta} ${fecha}
-- Fuente: supabase/manuales/${carpeta}/*.md (no edites este archivo a mano).
-- Requiere V196 (manuales) y V214 (columna clave).
-- Solo agrega: crea la sección si no existe e inserta cada manual si su
-- clave todavía no está. No cambia ni borra ningún manual existente.
-- Se puede correr dos veces sin duplicar.
-- Manuales: ${manuales.map((x) => x.clave).join(', ')}
-- =====================================================================
do $$
declare v_sec uuid;
begin
  if to_regclass('public.manuales') is null then
    raise exception 'Falta aplicar V196 (schema_v196_manuales.sql). No se cargó nada.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'manuales' and column_name = 'clave') then
    raise exception 'Falta aplicar V214 (schema_v214_manuales_clave.sql). No se cargó nada.';
  end if;

  select id into v_sec from public.manual_secciones
   where eliminado_en is null and lower(btrim(nombre)) = lower(${dolar(seccion.nombre, 's')});
  if v_sec is null then
    insert into public.manual_secciones (nombre, descripcion, icono, orden)
    values (${dolar(seccion.nombre, 's')}, ${dolar(seccion.descripcion, 's')}, ${dolar(seccion.icono, 's')},
            coalesce((select max(orden) from public.manual_secciones where eliminado_en is null), 0) + 1)
    returning id into v_sec;
  end if;

  insert into public.manuales (seccion_id, clave, titulo, contenido, orden, actualizado_por_nombre)
  select v_sec, x.clave, x.titulo, x.contenido, x.orden, 'Carga inicial'
    from (values
${filas}
    ) as x(orden, clave, titulo, contenido)
   where not exists (select 1 from public.manuales m
                      where m.clave = x.clave and m.eliminado_en is null);
end $$;

-- Verificación: debe regresar ${manuales.length} filas.
-- select clave, titulo, length(contenido) from public.manuales
--  where clave in (${manuales.map((x) => `'${x.clave}'`).join(', ')}) and eliminado_en is null order by orden;
`

const salida = join(raiz, 'supabase', `datos_${fecha}_manuales_${carpeta}.sql`)
writeFileSync(salida, sql)
console.log(`${manuales.length} manuales → ${salida}`)
