// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { useState } from 'vue-smart-state'
import { payload, resetNuxtApp } from './nuxt-app'
import { memoryStorage, stringSchema } from './helpers'

import { useSmartState } from '../src/runtime/useSmartState'

vi.mock('vue-smart-state', async (importOriginal) => {
  const original = await importOriginal<typeof import('vue-smart-state')>()
  return { ...original, useState: vi.fn(original.useState) }
})

beforeEach(() => {
  resetNuxtApp()
})

describe('useSmartState (server)', () => {
  it('reads a custom storage during ssr', () => {
    const storage = memoryStorage({ theme: '"dark"' })
    const [theme] = useSmartState('light', { persist: true, storageKey: 'theme', storage })
    expect(theme.value).toBe('dark')
  })

  it('seeds the payload with the storage-read value', () => {
    const storage = memoryStorage({ theme: '"dark"' })
    useSmartState('light', { persist: true, storageKey: 'theme', storage })
    expect(payload.get('smart-state:theme')?.value).toBe('dark')
  })

  it('mirrors setState into the payload', () => {
    const [, setLocale] = useSmartState('en', { payloadKey: 'locale' })
    setLocale('it')
    expect(payload.get('smart-state:locale')?.value).toBe('it')
  })

  it('runs the schema on server storage reads', () => {
    const storage = memoryStorage({ theme: '42' })
    const [theme] = useSmartState('light', {
      persist: true,
      storageKey: 'theme',
      storage,
      schema: stringSchema
    })
    expect(theme.value).toBe('light')
  })

  it('honours an expired envelope on the server', () => {
    const storage = memoryStorage({
      draft: JSON.stringify({ __vss: 1, value: '"old"', expires: Date.now() - 1000 })
    })
    const [draft] = useSmartState('empty', {
      persist: true,
      storageKey: 'draft',
      storage,
      ttl: 60_000
    })
    expect(draft.value).toBe('empty')
  })

  it('migrates versioned values on the server', () => {
    const storage = memoryStorage({
      draft: JSON.stringify({ __vss: 1, value: '"old"', v: 1 })
    })
    const [draft] = useSmartState('empty', {
      persist: true,
      storageKey: 'draft',
      storage,
      version: 2,
      migrate: (value, fromVersion) => (fromVersion === 1 ? `${value as string}-migrated` : undefined)
    })
    expect(draft.value).toBe('old-migrated')
  })

  it('persists reset() through the storage on the server', () => {
    const storage = memoryStorage({ theme: '"dark"' })
    const [, , { reset }] = useSmartState('light', { persist: true, storageKey: 'theme', storage })
    reset()
    expect(storage.getItem('theme')).toBe('"light"')
  })

  it('leaves the payload untouched with payloadKey: false', () => {
    const storage = memoryStorage({ theme: '"dark"' })
    useSmartState('light', { persist: true, storageKey: 'theme', storage, payloadKey: false })
    expect(payload.size).toBe(0)
  })
})

describe('useSmartState (server persistence)', () => {
  it('persists direct .value assignments', () => {
    const storage = memoryStorage()
    const [theme] = useSmartState('light', { persist: true, storageKey: 'theme', storage })
    theme.value = 'dark'
    expect(storage.getItem('theme')).toBe('"dark"')
    expect(payload.get('smart-state:theme')?.value).toBe('dark')
  })

  it('writes the vue-smart-state envelope when a ttl or version is set', () => {
    const storage = memoryStorage()
    const [, setDraft] = useSmartState('', {
      persist: true,
      storageKey: 'draft',
      storage,
      ttl: 60_000,
      version: 3
    })
    setDraft('hello')
    const envelope = JSON.parse(storage.getItem('draft')!)
    expect(envelope).toMatchObject({ __vss: 1, value: '"hello"', v: 3 })
    expect(envelope.expires).toBeGreaterThan(Date.now())
  })

  it('uses a custom serializer for server writes', () => {
    const storage = memoryStorage()
    const [, setTags] = useSmartState<string[]>([], {
      persist: true,
      storageKey: 'tags',
      storage,
      serializer: { read: (raw) => raw.split(','), write: (value) => value.join(',') }
    })
    setTags(['a', 'b'])
    expect(storage.getItem('tags')).toBe('a,b')
  })

  it('removes the entry when set to undefined', () => {
    const storage = memoryStorage({ theme: '"dark"' })
    const [, setTheme] = useSmartState<string | undefined>('light', {
      persist: true,
      storageKey: 'theme',
      storage
    })
    setTheme(undefined)
    expect(storage.data.has('theme')).toBe(false)
  })

  it('clear() removes the entry and returns to the initial value', () => {
    const storage = memoryStorage({ theme: '"dark"' })
    const [theme, , { clear }] = useSmartState('light', { persist: true, storageKey: 'theme', storage })
    clear()
    expect(theme.value).toBe('light')
    expect(storage.data.has('theme')).toBe(false)
  })

  it('persists without a payload key too', () => {
    const storage = memoryStorage()
    const [theme, setTheme] = useSmartState('light', {
      persist: true,
      storageKey: 'theme',
      storage,
      payloadKey: false
    })
    setTheme('dark')
    expect(theme.value).toBe('dark')
    expect(storage.getItem('theme')).toBe('"dark"')
  })

  it('reads storage during ssr even when hydrate is mounted', async () => {
    const App = defineComponent({
      setup() {
        const [theme] = useSmartState('light', {
          persist: true,
          storageKey: 'theme',
          storage: memoryStorage({ theme: '"dark"' }),
          hydrate: 'mounted'
        })
        return () => h('div', theme.value)
      }
    })
    expect(await renderToString(createSSRApp(App))).toBe('<div>dark</div>')
  })

  it('hands vue-smart-state no cross-tab sync and no debounce on the server', () => {
    useSmartState('light', {
      persist: true,
      storageKey: 'theme',
      storage: memoryStorage(),
      syncTabs: 'broadcast',
      writeDebounce: 500
    })
    expect(vi.mocked(useState).mock.lastCall?.[1]).toMatchObject({
      syncTabs: false,
      writeDebounce: undefined,
      hydrate: 'immediate'
    })
  })
})
