import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Prevent stale cached builds from trapping users on old deployments.
      // This keeps the manifest but removes the service worker and its caches on visit.
      selfDestroying: true,
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Limen Auto Parts Center',
        short_name: 'Limen',
        description: 'Limen Auto Parts Center - Cost Estimation and Quotation System',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/vite.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/vite.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    modulePreload: {
      resolveDependencies(_filename, deps, context) {
        if (context.hostType !== 'html') {
          return deps;
        }

        return deps.filter((dep) => {
          const normalizedDep = dep.toLowerCase();

          return ![
            'stockroom',
            'r3f',
            'three-core',
            'scanner',
            'analytics-charts',
          ].some((pattern) => normalizedDep.includes(pattern));
        });
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@react-three/drei')) {
            return 'stockroom-r3f-drei';
          }

          if (id.includes('@react-three/fiber')) {
            return 'stockroom-r3f-core';
          }

          if (id.includes('\\three\\') || id.includes('/three/')) {
            return 'stockroom-three-core';
          }

          if (id.includes('recharts')) {
            return 'analytics-charts';
          }

          if (id.includes('html5-qrcode')) {
            return 'scanner';
          }

          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/') || id.includes('node_modules/scheduler/')) {
            return 'react-vendor';
          }

          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
})
