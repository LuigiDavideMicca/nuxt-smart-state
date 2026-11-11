import { addImports, createResolver, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: {
    name: 'nuxt-smart-state',
    compatibility: {
      nuxt: '>=3.15.0'
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
      ...[
        'UseSmartStateOptions',
        'StorageLike',
        'StandardSchemaV1',
        'CookieStorageOptions',
        'SetState',
        'UseStateControls'
      ].map((name) => ({ name, from: composable, type: true }))
    ])
  }
})
