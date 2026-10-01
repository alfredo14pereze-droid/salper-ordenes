// Capturas "antes/después" del rediseño visual (Parte 0).
// Uso: node scripts/capturas-rediseno.mjs antes|despues
//
// Login opcional vía .env.capturas (gitignorado, ver .gitignore):
//   CAPTURAS_EMAIL=...
//   CAPTURAS_PASSWORD=...
// Sin esas variables, el script solo toma las pantallas que no requieren
// sesión (Dashboard) y avisa cuáles se omitieron.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const modo = process.argv[2]
if (modo !== 'antes' && modo !== 'despues') {
  console.error('Uso: node scripts/capturas-rediseno.mjs antes|despues')
  process.exit(1)
}

const outDir = path.join(root, 'capturas-rediseno', modo)
mkdirSync(outDir, { recursive: true })

const envPath = path.join(root, '.env.capturas')
let email = null
let password = null
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const [k, ...rest] = line.split('=')
    if (!k || !k.trim()) continue
    const v = rest.join('=').trim()
    if (k.trim() === 'CAPTURAS_EMAIL') email = v
    if (k.trim() === 'CAPTURAS_PASSWORD') password = v
  }
}

const BASE_URL = process.env.CAPTURAS_BASE_URL || 'http://localhost:5173'

const VIEWPORTS = [
  { name: 'mobile', width: 393, height: 852, deviceScaleFactor: 2 },
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
]

async function login(page) {
  await page.goto(`${BASE_URL}/#/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(1500)
}

async function shot(page, file) {
  await page.waitForTimeout(800)
  const dest = path.join(outDir, `${file}.png`)
  await page.screenshot({ path: dest, fullPage: true })
  console.log('✓', path.relative(root, dest))
}

async function capturarViewport(browser, vp, omitidas) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
  })
  const page = await context.newPage()
  const sesionIniciada = !!(email && password)
  if (sesionIniciada) await login(page)

  // 01 — Dashboard (sin sesión no requerida, pero ya quedamos logueados si había credenciales)
  await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' })
  await shot(page, `01_dashboard_${vp.name}`)

  // 02 — Detalle de orden: clic en la primera tarjeta del dashboard (no es <a>, es onClick).
  const huboTarjeta = await page.evaluate(() => {
    const card = document.querySelector('.order-card')
    if (card) {
      card.click()
      return true
    }
    return false
  })
  if (huboTarjeta) {
    await page.waitForTimeout(800)
    await shot(page, `02_detalle_orden_${vp.name}`)
  } else {
    omitidas.add('02_detalle_orden (no hay órdenes en el dashboard para abrir)')
  }

  if (!sesionIniciada) {
    omitidas.add('03_crear_orden (requiere sesión, ver .env.capturas)')
    omitidas.add('04_pendientes (requiere sesión, ver .env.capturas)')
    omitidas.add('05_talleros (requiere sesión, ver .env.capturas)')
  } else {
    await page.goto(`${BASE_URL}/#/nueva`, { waitUntil: 'networkidle' })
    await shot(page, `03_crear_orden_${vp.name}`)

    await page.goto(`${BASE_URL}/#/pendientes`, { waitUntil: 'networkidle' })
    await shot(page, `04_pendientes_${vp.name}`)

    await page.goto(`${BASE_URL}/#/talleros`, { waitUntil: 'networkidle' })
    await shot(page, `05_talleros_${vp.name}`)
  }

  await context.close()
}

async function run() {
  const browser = await chromium.launch()
  const omitidas = new Set()
  for (const vp of VIEWPORTS) {
    await capturarViewport(browser, vp, omitidas)
  }
  await browser.close()

  if (omitidas.size) {
    console.log('\nOmitidas:')
    for (const o of omitidas) console.log(' -', o)
  }
}

run()
