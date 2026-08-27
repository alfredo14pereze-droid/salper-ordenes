import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' hace que los assets se referencien con rutas relativas.
// Esto permite desplegar el mismo build tanto en Vercel (raíz del dominio)
// como en GitHub Pages (subcarpeta tipo usuario.github.io/salper-ordenes/)
// sin tener que tocar esta configuración.
export default defineConfig({
  plugins: [react()],
  base: './',
})
