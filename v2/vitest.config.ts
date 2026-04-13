import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // server-only throws in jsdom (window is defined). Alias to a no-op
      // so tests can import server-only modules without errors.
      'server-only': path.resolve(__dirname, './src/test/mocks/server-only.ts'),
      // framer-motion: AnimatePresence mode="wait" defers child mounting until
      // exit animations complete — which never happens in jsdom. Mock strips all
      // animation props so mode transitions are synchronous in tests.
      'framer-motion': path.resolve(__dirname, './src/test/mocks/framer-motion.tsx'),
    },
  },
})
