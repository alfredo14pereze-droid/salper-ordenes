// V196 — Manuales: buscador y ayudas de la pantalla (sin React, con pruebas
// en manuales.test.js).
import { normalizar, palabras } from './inventarioBusqueda.js'
import { textoPlano } from './markdownManual.js'

// Cada letra a minúscula y sin acento, conservando la posición (para poder
// recortar el fragmento del texto original).
function plegar(s) {
  return Array.from(String(s || ''), (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().slice(0, 1) || ' ').join('')
}

// Pedacito del contenido alrededor de la primera palabra encontrada.
export function fragmento(plano, buscadas, largo = 140) {
  const p = plegar(plano)
  let pos = -1
  for (const b of buscadas) {
    const k = p.indexOf(b)
    if (k >= 0 && (pos < 0 || k < pos)) pos = k
  }
  if (pos < 0) return plano.slice(0, largo).trim() + (plano.length > largo ? '…' : '')
  const desde = Math.max(0, pos - 40)
  const hasta = Math.min(plano.length, desde + largo)
  return (desde > 0 ? '…' : '') + plano.slice(desde, hasta).replace(/\s+/g, ' ').trim() + (hasta < plano.length ? '…' : '')
}

// Busca en título y contenido de todos los manuales. Cada palabra escrita
// tiene que aparecer (sin importar acentos ni mayúsculas). Primero los que
// la traen en el título. Devuelve [{ manual, seccion, enTitulo, fragmento }].
export function buscarManuales(texto, manuales, secciones) {
  const buscadas = palabras(texto)
  if (!buscadas.length) return []
  const porId = new Map(secciones.map((s) => [s.id, s]))
  const res = []
  for (const m of manuales) {
    const seccion = porId.get(m.seccion_id)
    if (!seccion) continue
    const titulo = normalizar(m.titulo)
    const plano = textoPlano(m.contenido)
    const donde = titulo + ' ' + normalizar(plano)
    if (!buscadas.every((b) => donde.includes(b))) continue
    const enTitulo = buscadas.every((b) => titulo.includes(b))
    res.push({ manual: m, seccion, enTitulo, fragmento: fragmento(plano, buscadas) })
  }
  res.sort((a, b) => (a.enTitulo === b.enTitulo ? 0 : a.enTitulo ? -1 : 1) || a.seccion.orden - b.seccion.orden || a.manual.orden - b.manual.orden)
  return res
}

export function ordenar(lista) {
  return [...lista].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.creado_en).localeCompare(String(b.creado_en)))
}

export function contarPorSeccion(manuales) {
  const m = new Map()
  for (const x of manuales) m.set(x.seccion_id, (m.get(x.seccion_id) || 0) + 1)
  return m
}
