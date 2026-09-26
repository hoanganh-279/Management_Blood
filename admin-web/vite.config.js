import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Khóa origin cố định để khớp Google OAuth Authorized JavaScript origins
  // (tránh lệch localhost vs 127.0.0.1 → origin_mismatch)
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
})
