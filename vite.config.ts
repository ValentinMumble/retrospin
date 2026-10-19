import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Spotify accepts a loopback IP as login redirect address, not "localhost".
  server: { host: '127.0.0.1', port: 5190, strictPort: true },
  // The album data (with song lists) ships in the bundle: about 165 kB compressed.
  build: { chunkSizeWarningLimit: 700 },
})
