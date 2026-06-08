import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://161.53.133.253:8080',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
