import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/pharm/public/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost/pharm/backend/public',
        changeOrigin: true,
        rewrite: path => path,
      },
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: false,
    sourcemap: false,
  },
})
