import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    base: env.VITE_BASE_PATH || '/pharm/public/',
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
  }
})
