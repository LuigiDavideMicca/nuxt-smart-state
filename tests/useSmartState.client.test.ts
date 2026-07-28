import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, type Ref } from 'vue'
import { memoryStorage, stringSchema } from './helpers'

const { payload } = vi.hoisted(() => ({ payload: new Map<string, Ref<unknown>>() }))

vi.mock('nuxt/app', async () => {
  const { ref } = await import('vue')
  return {
    useState: (key: string, init?: () => unknown) => {
      if (!payload.has(key)) payload.set(key, ref(init?.()))
      return payload.get(key)
    }
  }
})

import { cookieStorage, useSmartState } from '../src/runtime/useSmartState'

const seed = async (key: string, value: unknown) => {
  const { ref } = await import('vue')
  payload.set(`smart-state:${key}`, ref(value))
}

beforeEach(() => {
  payload.clear()
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
