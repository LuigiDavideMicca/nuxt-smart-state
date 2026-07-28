// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ref } from 'vue'
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

import { useSmartState } from '../src/runtime/useSmartState'

beforeEach(() => {
  payload.clear()
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
