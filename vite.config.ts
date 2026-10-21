import path from 'path';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import nodePath from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';

// Resuelve el identificador de build: hash corto del commit de git,
// con respaldo a una marca de tiempo si git no está disponible (Req 1.3/1.4)
const resolveBuildId = (): string => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return `ts-${Date.now()}`;
  }
};

// Plugin inline: publica el buildId en /version.json (dev) y dist/version.json (build)
const buildIdPlugin = (buildId: string): Plugin => ({
  name: 'bistro-build-id',
  // Dev: servir /version.json en memoria, siempre fresco (Req 2.4)
  configureServer(server) {
    server.middlewares.use('/version.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ buildId }));
    });
  },
  // Build: escribir dist/version.json (Req 1.1)
  closeBundle() {
    const outFile = nodePath.resolve(__dirname, 'dist', 'version.json');
    writeFileSync(outFile, JSON.stringify({ buildId }));
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isAnalyze = process.env.ANALYZE === 'true';
  const isProd = mode === 'production';

  // Resolver el buildId una sola vez por compilación (Req 1.5)
  const buildId = resolveBuildId();

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      open: true,
      allowedHosts: true,
      watch: {
        usePolling: true,
      },
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
      }
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          '180px_fondoBlanco.png',
          '192px_fondoBlanco.png',
          '512px_fondoBlanco.png',
          '512px_transparente.png',
          'gasto-192.png',
          'gasto-512.png',
          'foto-venta-192.png',
          'foto-venta-512.png',
          'compra-192.png',
          'compra-512.png',
        ],
        manifest: false,
        workbox: {
          // push-sw.js añade el listener de Web Push al SW generado por Workbox
          importScripts: ['/push-sw.js'],
          // El bundle principal supera los 2 MiB (límite por defecto de Workbox).
          // Subimos el tope a 3 MiB para que sí se precachee y la PWA funcione offline.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,woff2,woff,ttf,png,svg,ico}'],
          // version.json y manifest.json deben servirse siempre frescos: excluirlos del precache
          globIgnores: ['**/version.json', '**/manifest*.json'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/, /^\/__\//],
          runtimeCaching: [
            {
              // version.json nunca se sirve cacheado: siempre red (Req 8.3)
              urlPattern: /\/version\.json/,
              handler: 'NetworkOnly',
            },
            {
              // manifest*.json siempre fresco para actualizaciones automáticas de WebAPK
              urlPattern: /\/manifest.*\.json/,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/cdn\.tailwindcss\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'tailwind-cdn',
                expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/accounts\.google\.com\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'supabase-product-images',
                expiration: {
                  maxEntries: 150,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
                cacheableResponse: { statuses: [200] },
                plugins: [
                  {
                    cacheWillUpdate: async ({ response }: any) => {
                      if (response && response.type === 'opaque') return null;
                      return response;
                    },
                  },
                ],
              },
            },
          ],
        },
      }),
      buildIdPlugin(buildId),
      isAnalyze && visualizer({
        open: true,
        filename: 'dist/bundle-stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
    ].filter(Boolean),
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
      __BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    esbuild: isProd ? { drop: ['console', 'debugger'] } : {},
    build: {
      rollupOptions: {
        output: {
          // Separar chunks grandes en archivos independientes
          manualChunks: {
            // Vendor: React y librerias core
            'vendor-react': ['react', 'react-dom'],
            // Supabase tiene su propio chunk
            'vendor-supabase': ['@supabase/supabase-js'],
            // Libreria de cropping (solo se usa en perfil)
            'vendor-cropper': ['react-easy-crop'],
          },
        },
      },
      // Solo advertir en chunks > 600KB (ajustado)
      chunkSizeWarningLimit: 600,
    },
  };
});
