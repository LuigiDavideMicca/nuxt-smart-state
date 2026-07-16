import { addImports, createResolver, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: {
    name: 'nuxt-smart-state',
    configKey: 'smartState',
    compatibility: {
      nuxt: '>=3.0.0'
    }
  },
  setup() {
    const resolver = createResolver(import.meta.url)
    // Aliased: Nuxt ships its own (server-oriented) useState.
    addImports([
      { name: 'useSmartState', from: resolver.resolve('./runtime/useSmartState') },
      {
        name: 'UseSmartStateOptions',
        from: resolver.resolve('./runtime/useSmartState'),
        type: true
      }
    ])
  }
})
