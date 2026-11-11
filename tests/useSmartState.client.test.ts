import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, nextTick } from 'vue'
import { finishHydration, payload, resetNuxtApp, seed } from './nuxt-app'
import { memoryStorage, stringSchema } from './helpers'
import { cookieStorage, useSmartState } from '../src/runtime/useSmartState'
import { useCookieStorage } from '../src/runtime/useCookieStorage'

beforeEach(() => {
  resetNuxtApp()
  localStorage.clear()
  document.cookie
    .split(';')
    .map((part) => part.split('=')[0]?.trim())
    .filter(Boolean)
    .forEach((name) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    })
})

describe('useSmartState (client)', () => {
  it('uses the payload value as the initial one', async () => {
    await seed('locale', 'it')
    const [locale] = useSmartState('en', { payloadKey: 'locale' })
    expect(locale.value).toBe('it')
  })

  it('lets a persisted value win over the payload', async () => {
    await seed('locale', 'it')
    localStorage.setItem('locale', '"fr"')
    const [locale] = useSmartState('en', { persist: true, storageKey: 'locale' })
    expect(locale.value).toBe('fr')
  })

  it('skips the payload with payloadKey: false', async () => {
    await seed('theme', 'dark')
    const [theme] = useSmartState('light', { payloadKey: false, storageKey: 'theme' })
    expect(theme.value).toBe('light')
  })

  it('accepts a payload value that passes the schema', async () => {
    await seed('theme', 'dark')
    const [theme] = useSmartState('light', { payloadKey: 'theme', schema: stringSchema })
    expect(theme.value).toBe('dark')
  })

  it('rejects a payload value that fails the schema', async () => {
    await seed('theme', 42)
    const [theme] = useSmartState('light', { payloadKey: 'theme', schema: stringSchema })
    expect(theme.value).toBe('light')
  })

  it('falls back to the initial value when parse throws on the payload', async () => {
    await seed('theme', 'bogus')
    const onError = vi.fn()
    const [theme] = useSmartState('light', {
      payloadKey: 'theme',
      parse: () => {
        throw new Error('nope')
      },
      onError
    })
    expect(theme.value).toBe('light')
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'read')
  })

  it('passes the schema through to storage hydration', () => {
    localStorage.setItem('theme', '42')
    const [rejected] = useSmartState('light', {
      persist: true,
      storageKey: 'theme',
      payloadKey: false,
      schema: stringSchema
    })
    expect(rejected.value).toBe('light')

    localStorage.setItem('theme', '"dark"')
    const [accepted] = useSmartState('light', {
      persist: true,
      storageKey: 'theme',
      payloadKey: false,
      schema: stringSchema
    })
    expect(accepted.value).toBe('dark')
  })

  it('applies a validated payload even when storage fails the schema', async () => {
    await seed('theme', 'dark')
    localStorage.setItem('theme', '42')
    const [theme] = useSmartState('light', {
      persist: true,
      storageKey: 'theme',
      schema: stringSchema
    })
    expect(theme.value).toBe('dark')
  })

  it('passes mergeDefaults through', () => {
    localStorage.setItem('prefs', '{"a":1}')
    const [prefs] = useSmartState(
      { a: 0, b: 2 },
      { persist: true, storageKey: 'prefs', payloadKey: false, mergeDefaults: true }
    )
    expect(prefs.value).toEqual({ a: 1, b: 2 })
  })

  it('passes version and migrate through', () => {
    localStorage.setItem('draft', JSON.stringify({ __vss: 1, value: '"old"', v: 1 }))
    const [draft] = useSmartState('empty', {
      persist: true,
      storageKey: 'draft',
      payloadKey: false,
      version: 2,
      migrate: (value, fromVersion) => (fromVersion === 1 ? `${value as string}-migrated` : undefined)
    })
    expect(draft.value).toBe('old-migrated')
  })

  it('reads and writes through cookieStorage', async () => {
    const storage = cookieStorage()
    storage.setItem('theme', '"dark"')
    const [theme, setTheme] = useSmartState('light', {
      persist: true,
      storageKey: 'theme',
      payloadKey: false,
      storage
    })
    expect(theme.value).toBe('dark')

    setTheme('sepia')
    await nextTick()
    expect(storage.getItem('theme')).toBe('"sepia"')
  })

  it('accepts syncTabs: broadcast', async () => {
    const [value, setValue] = useSmartState('a', {
      persist: true,
      storageKey: 'bc-key',
      payloadKey: false,
      syncTabs: 'broadcast'
    })
    setValue('b')
    await nextTick()
    expect(value.value).toBe('b')
    expect(localStorage.getItem('bc-key')).toBe('"b"')
  })

  it('composes payload with a custom storage backend', async () => {
    await seed('theme', 'dark')
    const storage = memoryStorage()
    const [theme, setTheme] = useSmartState('light', {
      persist: true,
      storageKey: 'theme',
      storage
    })
    expect(theme.value).toBe('dark')

    setTheme('sepia')
    await nextTick()
    expect(storage.getItem('theme')).toBe('"sepia"')
  })
})

describe('useSmartState (client hydration)', () => {
  const hydrate = async (ssrHtml: string, setup: () => () => ReturnType<typeof h>) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = document.createElement('div')
    container.innerHTML = ssrHtml
    const app = createSSRApp(defineComponent({ setup }))
    app.mount(container)
    await nextTick()
    const mismatches = [...warn.mock.calls, ...error.mock.calls].filter((call) =>
      /hydration/i.test(String(call[0]))
    )
    warn.mockRestore()
    error.mockRestore()
    return { container, mismatches, app }
  }

  it('hydrates a localStorage value without a mismatch, then applies it after mount', async () => {
    resetNuxtApp({ hydrating: true })
    seed('density', 'cozy')
    localStorage.setItem('density', '"compact"')
    const { container, mismatches } = await hydrate('<p class="cozy">cozy</p>', () => {
      const [density] = useSmartState('cozy', { persist: true, storageKey: 'density' })
      return () => h('p', { class: density.value }, density.value)
    })
    expect(mismatches).toEqual([])
    await nextTick()
    expect(container.innerHTML).toBe('<p class="compact">compact</p>')
    expect(localStorage.getItem('density')).toBe('"compact"')
  })

  it('hydrates a cookie value read by the server immediately, with no mismatch and no flash', async () => {
    resetNuxtApp({ hydrating: true })
    seed('theme', 'dark')
    document.cookie = `theme=${encodeURIComponent('"dark"')}; path=/`
    const rendered: string[] = []
    const { container, mismatches } = await hydrate('<p class="dark">dark</p>', () => {
      const [theme] = useSmartState('light', {
        persist: true,
        storageKey: 'theme',
        storage: useCookieStorage()
      })
      return () => {
        rendered.push(theme.value)
        return h('p', { class: theme.value }, theme.value)
      }
    })
    expect(mismatches).toEqual([])
    expect(rendered).toEqual(['dark'])
    expect(container.innerHTML).toBe('<p class="dark">dark</p>')
  })

  it('never lets a value set during setup overwrite the stored one before it is read', async () => {
    resetNuxtApp({ hydrating: true })
    localStorage.setItem('density', '"compact"')
    const { container } = await hydrate('<p>cozy</p>', () => {
      const [density, setDensity] = useSmartState('cozy', { persist: true, storageKey: 'density' })
      setDensity('roomy')
      return () => h('p', density.value)
    })
    await nextTick()
    expect(container.innerHTML).toBe('<p>compact</p>')
    expect(localStorage.getItem('density')).toBe('"compact"')
  })

  it('renders a server-set value during hydration without overwriting the one stored on the device', async () => {
    resetNuxtApp({ hydrating: true })
    seed('locale', 'it')
    localStorage.setItem('locale', '"fr"')
    const [locale] = useSmartState('en', { persist: true, storageKey: 'locale' })
    expect(locale.value).toBe('it')
    finishHydration()
    await nextTick()
    expect(locale.value).toBe('fr')
    expect(localStorage.getItem('locale')).toBe('"fr"')
  })

  it('keeps and persists a server-set value when the device stored nothing', async () => {
    resetNuxtApp({ hydrating: true })
    seed('locale', 'it')
    const [locale, , { reset }] = useSmartState('en', { persist: true, storageKey: 'locale' })
    finishHydration()
    await nextTick()
    expect(locale.value).toBe('it')
    expect(localStorage.getItem('locale')).toBe('"it"')
    reset()
    expect(locale.value).toBe('en')
  })

  it('setState during hydration starts from the server value', async () => {
    resetNuxtApp({ hydrating: true })
    seed('count', 5)
    localStorage.setItem('count', '1')
    const [count, setCount] = useSmartState(0, { persist: true, storageKey: 'count' })
    setCount((n) => n + 1)
    expect(count.value).toBe(6)
    finishHydration()
    await nextTick()
    expect(count.value).toBe(6)
    expect(localStorage.getItem('count')).toBe('6')
  })
})

describe('useSmartState (client semantics)', () => {
  it('falls back to the initial value, not the payload, when another tab removes the key', async () => {
    seed('theme', 'dark')
    localStorage.setItem('theme', '"dark"')
    const [theme] = useSmartState('light', { persist: true, storageKey: 'theme', syncTabs: true })
    expect(theme.value).toBe('dark')
    localStorage.removeItem('theme')
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'theme', newValue: null, storageArea: localStorage })
    )
    expect(theme.value).toBe('light')
  })

  it('falls back to the initial value when the stored entry expired', () => {
    seed('draft', 'server')
    localStorage.setItem(
      'draft',
      JSON.stringify({ __vss: 1, value: '"old"', expires: Date.now() - 1000 })
    )
    const [draft, , { reset }] = useSmartState('empty', { persist: true, storageKey: 'draft', ttl: 1000 })
    expect(draft.value).toBe('server')
    reset()
    expect(draft.value).toBe('empty')
  })

  it('lets an explicitly stored initial value win over the payload', () => {
    seed('theme', 'dark')
    localStorage.setItem('theme', '"light"')
    const [theme] = useSmartState('light', { persist: true, storageKey: 'theme' })
    expect(theme.value).toBe('light')
  })

  it('keeps the payload in sync with client changes', () => {
    seed('locale', 'it')
    const [, setLocale] = useSmartState('en', { payloadKey: 'locale' })
    setLocale('fr')
    expect(payload.get('smart-state:locale')?.value).toBe('fr')
  })

  it('shares one instance between consumers of a persisted key', async () => {
    const [a, setA] = useSmartState('light', { persist: true, storageKey: 'theme' })
    const [b] = useSmartState('light', { persist: true, storageKey: 'theme' })
    expect(b).toBe(a)
    setA('dark')
    await nextTick()
    expect(b.value).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('"dark"')
  })

  it('keeps separate useCookieStorage() consumers of one key in sync', async () => {
    const options = { persist: true, storageKey: 'theme', payloadKey: false as const }
    const [, setA] = useSmartState('light', { ...options, storage: useCookieStorage() })
    const [b] = useSmartState('light', { ...options, storage: useCookieStorage() })
    setA('dark')
    await nextTick()
    expect(b.value).toBe('dark')
  })

  it('does not share instances across apps', () => {
    const [a] = useSmartState('light', { payloadKey: 'theme' })
    resetNuxtApp()
    const [b] = useSmartState('light', { payloadKey: 'theme' })
    expect(b).not.toBe(a)
  })
})
