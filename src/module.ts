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
    const composable = resolver.resolve('./runtime/useSmartState')
    // Aliased: Nuxt ships its own (server-oriented) useState.
    addImports([
      { name: 'useSmartState', from: composable },
      { name: 'cookieStorage', from: composable },
      { name: 'useCookieStorage', from: resolver.resolve('./runtime/useCookieStorage') },
      { name: 'UseSmartStateOptions', from: composable, type: true },
      { name: 'StorageLike', from: composable, type: true },
      { name: 'StandardSchemaV1', from: composable, type: true }
    ])
  }
})
