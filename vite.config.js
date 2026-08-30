import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Sin prefijo: también lee PORT del .env para alinear el proxy con la API.
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = String(env.PORT || 3001).trim() || '3001'

  return {
    plugins: [react()],
    // Flags compartidas front/back: PAYMENTS_MOCK / PAID_CHECKOUT_*
    envPrefix: ['VITE_', 'PAYMENTS_', 'APP_', 'PAID_'],
    resolve: {
      alias: {
        '@': path.resolve('./src'),
      },
    },
    optimizeDeps: {
      // MapLibre v6 resuelve su worker como un módulo hermano. Mantenerlo fuera
      // del prebundle preserva esa URL en desarrollo y evita un worker 404.
      exclude: ['maplibre-gl'],
    },
    build: {
      rollupOptions: {
        output: {
      manualChunks(id) {
        if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
          return 'vendor-react'
        }
        // Sin chunk manual para @supabase: el único import del cliente es
        // dinámico (src/lib/supabaseClient.js) y forzarlo a un chunk propio
        // hacía que el runtime de preload de Vite aterrizara ahí — el entry
        // terminaba importando estáticamente 200 KB de supabase-js en cada
        // visita anónima sólo para obtener el helper. Como chunk async natural
        // sólo baja cuando el atleta/staff realmente lo usa.
        if (id.includes('node_modules/lucide-react')) {
          return 'vendor-lucide'
        }
            if (id.includes('node_modules/@mercadopago') || id.includes('node_modules/mercadopago')) {
              return 'vendor-mp'
            }
            if (id.includes('node_modules/motion')) {
              return 'motion'
            }
            if (id.includes('node_modules/html2canvas')) {
              return 'html2canvas'
            }
          },
        },
      },
    },
    server: {
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
        // Cartografía OpenFreeMap por same-origin (CSP connect-src 'self').
        '/map-tiles': {
          target: 'https://tiles.openfreemap.org',
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/map-tiles/, ''),
          secure: true,
        },
      },
    },
    preview: {
      proxy: {
        '/map-tiles': {
          target: 'https://tiles.openfreemap.org',
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/map-tiles/, ''),
          secure: true,
        },
      },
    },
  }
})
