import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Bundle visualizer — only loaded when building in 'analyze' mode
// Run: npm run build:analyze  →  opens stats.html in the browser
const getPlugins = async (mode) => {
  if (mode !== 'analyze') return []
  const { visualizer } = await import('rollup-plugin-visualizer')
  return [visualizer({ open: true, gzipSize: true, brotliSize: true, filename: 'dist/stats.html' })]
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const extraPlugins = await getPlugins(mode)

  return {
    plugins: [react(), tailwindcss(), ...extraPlugins],

    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          configure: (proxy) => {
            // The SSE stream (/api/data/events) gets aborted whenever the client
            // closes it early (unmount, HMR reload, tab close). That abrupt close
            // surfaces here as ECONNRESET/"socket hang up" — harmless, so swallow
            // it instead of letting Vite log a scary stack trace.
            proxy.on('error', (err, req, res) => {
              const benign = err.code === 'ECONNRESET' || /socket hang up/i.test(err.message)
              if (benign && req.url?.startsWith('/api/data/events')) return
              console.error(`http proxy error: ${req.url}`, err)
              if (res && !res.headersSent) res.writeHead(502).end()
            })
          },
        },
      },
    },

    build: {
      // Target modern browsers — drops legacy polyfill weight.
      // ES2020 covers all browsers released since 2020 (~99% global usage).
      target: 'es2020',

      // Inline assets smaller than 4 KB as base64 (reduces HTTP requests for tiny icons/fonts).
      assetsInlineLimit: 4096,

      // Split CSS per chunk so only the styles needed for the current route load.
      cssCodeSplit: true,

      // Warn when any single chunk exceeds 600 KB (uncompressed).
      chunkSizeWarningLimit: 600,

      rollupOptions: {
        output: {
          // Manual vendor chunks — these stay in the CDN cache across deploys
          // even when the app code changes, eliminating re-downloads for 100K users.
          manualChunks: (id) => {
            // React core — smallest critical path chunk, loads on every page
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler/')) {
              return 'vendor-react'
            }
            // Router — loaded immediately after react-core
            if (id.includes('node_modules/react-router') || id.includes('node_modules/@remix-run')) {
              return 'vendor-router'
            }
            // TanStack Query + Virtual — enterprise data layer
            if (id.includes('node_modules/@tanstack/react-query') || id.includes('node_modules/@tanstack/react-virtual') || id.includes('node_modules/@tanstack/query-core')) {
              return 'vendor-tanstack'
            }
            // Charts — only used on dashboard/reports screens
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-')) {
              return 'vendor-charts'
            }
            // PDF processing — only used on pre-prep/extraction/HITL screens
            if (id.includes('node_modules/pdfjs-dist') || id.includes('node_modules/pdf-lib')) {
              return 'vendor-pdf'
            }
            // Spreadsheet / archive export — only used on import/reports screens
            if (id.includes('node_modules/xlsx') || id.includes('node_modules/jszip')) {
              return 'vendor-spreadsheet'
            }
            // Icons — lucide is large; isolated so it caches independently
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons'
            }
            // All other node_modules go into a general vendor chunk
            if (id.includes('node_modules/')) {
              return 'vendor-misc'
            }
            // App code is not chunked here — will be split once screens are
            // extracted into separate files (each file becomes its own chunk
            // automatically when imported via React.lazy()).
          },

          // Deterministic filenames: [name]-[hash].js ensures long-term cache
          // validity. Same content = same hash = CDN hit on next deploy.
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },

      // Production source maps for Sentry / error tracking without exposing source to users.
      // Set to false if you do not use an error tracker that consumes source maps.
      sourcemap: mode === 'production' ? 'hidden' : true,

      // Skip the brotli/gzip size report during build — saves ~2s per build.
      // The web server (nginx) handles compression at serve time.
      reportCompressedSize: false,
    },

    // Path alias — use @/ for src/ imports across the codebase
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  }
})
