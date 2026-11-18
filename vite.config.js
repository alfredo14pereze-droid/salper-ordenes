import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { jsonLdHtml } from './src/public-site/jsonld.js'

// base: '/' (nov-2026, página pública): con BrowserRouter el sistema vive en
// /app/... y /catalogo; con rutas relativas ('./') los assets se pedirían a
// /app/assets/... y la página saldría en blanco al recargar. Ya no se puede
// publicar en una subcarpeta de GitHub Pages (solo Vercel, en la raíz).
//
// PWA: el service worker SOLO precachea los archivos de la app (JS, CSS, HTML,
// íconos). No hay runtimeCaching, así que Supabase y cualquier API van siempre
// directo a la red (datos en vivo). registerType 'autoUpdate' (V150): un deploy nuevo
// se aplica solo y la página se recarga; cuándo se busca la versión nueva lo
// decide UpdatePrompt (al abrir la app y al cambiar de pantalla).
export default defineConfig({
  plugins: [
    react(),
    // Fase 2 de la página pública: JSON-LD (Organization + tienda) en el <head>.
    {
      name: 'salper-jsonld',
      transformIndexHtml: (html) => html.replace('</head>', `    ${jsonLdHtml()}\n  </head>`),
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'SALPER',
        short_name: 'SALPER',
        description: 'SALPER · Sistema Operativo',
        lang: 'es',
        display: 'standalone',
        // La app instalada abre directo al sistema, no a la página pública.
        start_url: '/app',
        scope: '/',
        theme_color: '#16130f',
        background_color: '#f7f6f2',
        icons: [
          { src: 'android-chrome-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,ico,svg,webmanifest}'],
        // Imágenes y PDFs de la página pública: no se precachean (no los usa el sistema).
        globIgnores: ['img/**', 'docs/**', 'og-salper.jpg'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Solo el sistema (/app, /login) se abre desde la caché del service worker.
        // La página pública (/, /catalogo, /tienda…) siempre se pide a la red: si no,
        // quien ya usó el sistema veía la versión vieja del sitio hasta abrir /app.
        navigateFallbackAllowlist: [/^\/app(\/|$)/, /^\/login(\/|$|\?)/],
        // Abrir un PDF, el sitemap o /api en el navegador también es una
        // "navegación": sin esto el service worker contestaría con la app.
        navigateFallbackDenylist: [/^\/api\//, /^\/docs\//, /^\/img\//, /\.(pdf|xml|txt|webp|png|jpg)$/i],
        cleanupOutdatedCaches: true,
        // Con injectRegister: false el plugin NO activa esto solo, aunque
        // registerType sea 'autoUpdate': sin estas dos líneas la versión nueva
        // se quedaría "en espera" y nadie se actualizaría.
        skipWaiting: true,
        clientsClaim: true,
        // Sin runtimeCaching a propósito: nada de Supabase/API en caché.
      },
    }),
  ],
  base: '/',
})
