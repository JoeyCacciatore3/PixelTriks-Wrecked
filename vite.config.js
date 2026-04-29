import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  server: {
    port: 3000,
    host: true,
    open: false
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: 'esbuild',
    cssMinify: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: {
          three:  ['three'],
          rapier: ['@dimforge/rapier3d-compat'],
          vendor: ['peerjs']
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  },
  worker: {
    format: 'es'
  }
});
