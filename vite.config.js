import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base: './' hace que los assets se referencien con rutas relativas.
// Esto permite desplegar el mismo build tanto en Vercel (raíz del dominio)
// como en GitHub Pages (subcarpeta tipo usuario.github.io/salper-ordenes/)
// sin tener que tocar esta configuración.
//
// PWA: el service worker SOLO precachea los archivos de la app (JS, CSS, HTML,
// íconos). No hay runtimeCaching, así que Supabase y cualquier API van siempre
// directo a la red (datos en vivo). registerType 'autoUpdate' (V150): un deploy nuevo
// se aplica solo y la página se recarga; cuándo se busca la versión nueva lo
// decide UpdatePrompt (al abrir la app y al cambiar de pantalla).
export default defineConfig({
  plugins: [
    react(),
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
        start_url: './#/',
        scope: './',
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
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
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
  base: './',
})
