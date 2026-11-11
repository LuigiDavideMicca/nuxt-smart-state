import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // a linked vue-smart-state must share this project's vue, as it does in an app
    dedupe: ['vue'],
    alias: {
      '#app': fileURLToPath(new URL('./tests/nuxt-app.ts', import.meta.url))
    }
  },
  test: {
    environment: 'happy-dom'
  }
})
