// Prueba del reconocimiento de productos al subir una OC de Frisa, con el catálogo real (68 claves).
// Si una OC nueva no se reconoce, agrega aquí su texto tal cual viene y la clave correcta.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sugerirClave, tallaDeProducto } from './frisaSurtido.js'
import { CATALOGO_FRISA } from './frisaCatalogo.fixture.js'

const clave = (texto, talla) => sugerirClave(texto, talla, CATALOGO_FRISA).producto_id

test('cada clave se reconoce con su propio nombre (sin la talla) y su talla', () => {
  for (const p of CATALOGO_FRISA) {
    const talla = tallaDeProducto(p)
    const texto = p.nombre.replace(/\bT-\S+\s*$/, '')
    assert.equal(clave(texto, talla), p.clave, `${p.nombre} (talla ${talla})`)
  }
})

// Textos como pueden venir en la OC de Frisa → clave correcta.
const CASOS = [
  ['PLAYERA ROJA NUEVO INGRESO', 'M', 'PLAFR-000M-01MCRO2I'],
  ['PLAYERA C/R M/C S/REFLEJANTE 2 IMP. ROJA FRISA NUEVO INGRESO', 'L', 'PLAFR-000L-01MCRO2I'],
  ['PLAYERA ROJA', 'XL', 'PLAFR-00XL-01MCRO2I'],
  ['PLAYERA ROJO MANGA CORTA', '2XL', 'PLAFR-02XL-01MCRO2I'],
  ['PLAYERA SIN REFLEJANTE ROJA NUEVO INGRESO FRISA', 'S', 'PLAFR-000S-01MCRO2I'],
  ['PLAYERA VERDE', 'M', 'PLAFR-000M-01MCVE2I'],
  ['PLAYERA VERDE NUEVO INGRESO', 'L', 'PLAFR-000L-01MCVE2I'],
  ['PLAYERA ORO MANGO', 'M', 'PLAFR-000M-01MCOM1I'],
  ['PLAYERA AMARILLA ORO MANGO NUEVO INGRESO', 'XL', 'PLAFR-00XL-01MCOM1I'],
  ['PLAYERA M/C AZUL MARINO C/REFLEJANTE', 'L', 'PLAFR-000L-01MCMA1I'],
  ['PLAYERA M/L AZUL MARINO C/REFLEJANTE', 'L', 'PLAFR-000L-01MLMA1I'],
  ['PLAYERA M/L S/REFLEJANTE 1 IMP. AZUL M. FRISA', 'L', 'PLAFR-000L-01MLMA1IS'],
  ['PLAYERA MANGA LARGA SIN REFLEJANTE AZUL', 'M', 'PLAFR-000M-01MLMA1IS'],
  ['CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B 1I FRISA NUEVO INGRESO', 'M', 'CAMFR-000M-01MZ1B1I'],
  ['CAMISA MEZCLILLA NUEVO INGRESO', 'XL', 'CAMFR-00XL-01MZ1B1I'],
  ['CAMISA DE MEZCLILLA 7 OZ M/L C/REFLEJANTE 1B FRISA', 'M', 'CAMFR-000M-01MZ1B'],
  ['PANTALON DE MEZCLILLA 14OZ FRISA', '34', 'PANFR-0034-01MEZ'],
  ['PANTALON MEZCLILLA NUEVO INGRESO', '32', 'PANFR-0032-01MEZ'],
  ['BATA LABORATORIO', 'L', 'BATFR-000L-01LABFR'],
]

test('textos de OC con palabras de más (NUEVO INGRESO, etc.)', () => {
  for (const [texto, talla, esperada] of CASOS) assert.equal(clave(texto, talla), esperada, `"${texto}" talla ${talla}`)
})

test('si el texto no es de Frisa no inventa clave', () => {
  assert.equal(clave('BOTA INDUSTRIAL', 'M'), null)
  assert.equal(clave('PLAYERA ROJA', '5XL'), null)
})

test('el número de material de la OC manda sobre el nombre', () => {
  const ps = CATALOGO_FRISA.map((p) => (p.clave === 'PANFR-0028-01MEZ' ? { ...p, codigos: ['1020311'] } : p))
  assert.deepEqual(sugerirClave('PANTALON MEZCLILLA TALLA 28', '', ps, [], '1020311'), { producto_id: 'PANFR-0028-01MEZ', como: 'codigo' })
  // número desconocido: se va por el nombre
  assert.equal(sugerirClave('PANTALON MEZCLILLA TALLA 28', '28', ps, [], '9999999').producto_id, 'PANFR-0028-01MEZ')
})
