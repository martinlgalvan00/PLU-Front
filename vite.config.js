import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import {
  CHECKIN_SHELL_PRECACHE_IGNORE,
  isCheckinShellAsset,
} from './src/lib/checkinShellPrecache.js'

export default defineConfig(({ mode }) => {
  // Sin prefijo: también lee PORT del .env para alinear el proxy con la API.
  const env = loadEnv(mode, process.cwd(), '')
  // Playwright (y cualquier proceso que ya traiga PORT) manda: loadEnv no
  // pisa process.env, así que el E2E en 3011 no se iba al .env de `npm run dev`.
  const apiPort = String(process.env.PORT || env.PORT || 3001).trim() || '3001'
  // 127.0.0.1 evita AggregateError/ECONNREFUSED por dual-stack de `localhost`
  // (::1 vs 127.0.0.1) cuando el API aún no escucha o solo en una familia.
  const apiProxyTarget = `http://127.0.0.1:${apiPort}`
  const ticketSalesEnabled =
    process.env.VITE_TICKET_SALES_ENABLED ?? env.VITE_TICKET_SALES_ENABLED ?? ''

  // Visible en la consola de `npm run dev` si hay desfasaje de PORT con el API.
  console.info(`[vite] /api proxy → ${apiProxyTarget}`)

  return {
    plugins: [
      react(),
      // Sin el HTML y el JS de arranque, reabrir el teléfono sin señal no tiene
      // app. La instalación precachea solo eso (y las fuentes). Check-in y el
      // resto se guardan la primera vez que se abren. Mapas, 3D y el checkout
      // ni siquiera entran en esa lista. cleanupOutdatedCaches suelta el
      // build anterior después de un deploy.
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        manifest: false,
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallback: 'index.html',
          globPatterns: ['**/*.{js,css,html,woff2}'],
          globIgnores: [...CHECKIN_SHELL_PRECACHE_IGNORE],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          manifestTransforms: [
            (entries) => ({
              manifest: entries.filter((entry) => isCheckinShellAsset(entry.url)),
              warnings: [],
            }),
          ],
          // Lo que la puerta abre después del arranque (check-in, antd, textos)
          // queda en cache la primera vez que hay señal. No entra en la instalación.
          runtimeCaching: [
            {
              urlPattern: /\/assets\/.+\.(?:js|css|woff2)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'plu-door-assets',
                expiration: {
                  maxEntries: 64,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    // Flags compartidas front/back: PAYMENTS_MOCK / PAID_CHECKOUT_*
    envPrefix: ['VITE_', 'PAYMENTS_', 'APP_', 'PAID_'],
    // Vite no inyecta VITE_* desde process.env, sólo desde archivos .env.
    // El arnés E2E puede setear el freno en el entorno del proceso.
    define: {
      'import.meta.env.VITE_TICKET_SALES_ENABLED': JSON.stringify(ticketSalesEnabled),
    },
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
        if (id.includes('node_modules/three')) {
          return 'three'
        }
        if (id.includes('node_modules/maplibre-gl')) {
          return 'maplibre'
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
      // En Windows el default a veces queda solo en [::1] y 127.0.0.1:5173 no conecta.
      host: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
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
