// Datos estructurados (JSON-LD) de la página pública. vite.config.js los
// inserta en el <head> de index.html al compilar, con los mismos datos de
// content.js (sin duplicar direcciones ni horarios).
// Solo Organization + la tienda (SportingGoodsStore). La planta NO se marca
// como LocalBusiness a propósito: no es punto de venta.
import { TIENDA, CONTACTO, REDES, hayDato } from './content.js'

const SITIO = 'https://www.salperdeportes.com'
const DIAS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const tel = (t) => '+52 ' + t

export function jsonLd() {
  const redes = Object.values(REDES).filter((u) => hayDato(u) && u !== '#')
  const organizacion = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITIO}/#organizacion`,
    name: 'SALPER',
    legalName: 'SALPER S.A. de C.V.',
    url: `${SITIO}/`,
    logo: `${SITIO}/img/sitio/logo-azul.png`,
    foundingDate: '1970',
    telephone: tel(CONTACTO.personas.find((p) => p.nombre === 'General')?.telefono || TIENDA.telefono),
    ...(redes.length ? { sameAs: redes } : {}),
  }
  const tienda = {
    '@context': 'https://schema.org',
    '@type': 'SportingGoodsStore',
    '@id': `${SITIO}/tienda#tienda`,
    name: 'Tienda deportiva SALPER',
    url: `${SITIO}/tienda`,
    image: `${SITIO}${TIENDA.imagen}`,
    telephone: tel(TIENDA.telefono),
    parentOrganization: { '@id': `${SITIO}/#organizacion` },
    address: {
      '@type': 'PostalAddress',
      streetAddress: TIENDA.calle,
      addressLocality: TIENDA.ciudad,
      addressRegion: TIENDA.estado,
      addressCountry: TIENDA.pais,
    },
    openingHoursSpecification: TIENDA.horario.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.dias.map((d) => DIAS[d]),
      opens: h.abre,
      closes: h.cierra,
    })),
  }
  return [organizacion, tienda]
}

export function jsonLdHtml() {
  return jsonLd()
    .map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`)
    .join('\n    ')
}
