import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  // Relative paths required for Chrome extension popup/assets
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    // Emit one CSS file for the popup (required for Chrome extension)
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.source.html'),
        background: resolve(__dirname, 'src/entries/background/index.ts'),
        content: resolve(__dirname, 'src/entries/content/webglEvictor.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
