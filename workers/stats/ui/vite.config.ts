import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { defineConfig, type Plugin } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))

// The dev server answers /dashboard/data with synthetic data (dev/mock.ts) so the console runs without Cloudflare or D1.
// Production builds inline everything into one HTML file (vite-plugin-singlefile), which scripts/write-page.mjs embeds in the Worker.
export default defineConfig(({ command }) => ({
  root: here,
  base: '/',
  plugins: [react(), tailwindcss(), viteSingleFile(), ...(command === 'serve' ? [mockPlugin()] : [])],
  // An inline empty PostCSS config: the repository root's postcss.config is never picked up by this app.
  css: { postcss: { plugins: [] } },
  resolve: { alias: { '@': path.resolve(here, 'src') } },
  server: { port: 5180, strictPort: true, host: '127.0.0.1' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
  },
}))

function mockPlugin(): Plugin {
  return {
    name: 'everybird-stats-mock',
    // Loaded through Vite's module runner, so the config itself never imports the Worker's TypeScript.
    async configureServer(server) {
      const { workspaceMock } = (await server.ssrLoadModule('/dev/mock.ts')) as typeof import('./dev/mock')
      server.middlewares.use(workspaceMock())
    },
  }
}
