import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
