import { addImports, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: {
    name: 'nuxt-smart-state',
    configKey: 'smartState',
    compatibility: {
      nuxt: '>=3.0.0'
    }
  },
  setup() {
    // Aliased: Nuxt ships its own (server-oriented) useState.
    addImports([
      { name: 'useState', as: 'useSmartState', from: 'vue-smart-state' },
      { name: 'UseStateOptions', as: 'UseSmartStateOptions', from: 'vue-smart-state', type: true }
    ])
  }
})
