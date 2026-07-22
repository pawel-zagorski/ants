/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Served as a GitHub Pages project site at https://pawel-zagorski.github.io/ants/,
  // so production assets and runtime paths must be resolved under `/ants/`. Dev
  // server and Vitest (command !== 'build') stay at '/' so local runs and tests
  // keep using root-relative paths.
  base: command === 'build' ? '/ants/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}))
