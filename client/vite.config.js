import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Not 5000: macOS reserves it for the AirPlay Receiver, which answers
      // every proxied request with 403 Forbidden.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
