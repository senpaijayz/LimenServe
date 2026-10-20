import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // LIMEN ships as a normal website: no install prompt, offline cache, or
  // service-worker lifecycle to leave users on stale operational data.
  plugins: [react()],
  build: {
    // Keep a machine-readable graph in every production build. The budget
    // verifier consumes this instead of inferring load behavior from manual
    // chunk names.
    manifest: true,
    rollupOptions: {
      output: {
        // Camera and 2D geometry are shared without pulling the WebGL renderer
        // back into the locator page's initial module graph.
        manualChunks(id) {
          if (id.replaceAll('\\', '/').endsWith('/locator3d/utils/locatorViewport.js')) return 'locator-viewport';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.js']
  }
})
