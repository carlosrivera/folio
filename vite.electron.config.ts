import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist-electron',
    emptyOutDir: false,
    lib: {
      entry: { main: 'electron/main.ts' },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['electron', 'electron-updater', 'node:fs', 'node:fs/promises', 'node:path', 'node:url'],
      output: { entryFileNames: '[name].js' },
    },
  },
})
