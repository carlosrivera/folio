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
      external: ['electron', 'electron-updater', /^node:/],
      output: { entryFileNames: '[name].js' },
    },
  },
})
