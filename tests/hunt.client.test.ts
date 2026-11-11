import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { resetNuxtApp, seed } from './nuxt-app'
import { memoryStorage } from './helpers'

import { useSmartState } from '../src/runtime/useSmartState'

beforeEach(() => {
  resetNuxtApp()
  localStorage.clear()
})

describe('hunt: client', () => {
  it('reset() returns to the initial value, not the server payload value', async () => {
    // flagship recipe: server read cookie "dark" and shipped it in the payload
    await seed('theme', 'dark')
    const storage = memoryStorage({ theme: '"dark"' })
    const [theme, , { reset }] = useSmartState('light', { persist: true, storageKey: 'theme', storage })
    expect(theme.value).toBe('dark')
    reset()
    await nextTick()
    expect(theme.value).toBe('light')
    expect(storage.getItem('theme')).toBe('"light"')
  })

  it('clear() returns to the initial value, not the server payload value', async () => {
    await seed('theme', 'dark')
    const storage = memoryStorage({ theme: '"dark"' })
    const [theme, , { clear }] = useSmartState('light', { persist: true, storageKey: 'theme', storage })
    clear()
    expect(theme.value).toBe('light')
  })

  it('two consumers of the same key share state on the client, as they do on the server', async () => {
    await seed('locale', 'it')
    const [a, setA] = useSmartState('en', { payloadKey: 'locale' })
    const [b] = useSmartState('en', { payloadKey: 'locale' })
    setA('fr')
    expect(a.value).toBe('fr')
    expect(b.value).toBe('fr')
  })

  it('a consumer mounted after a client-side change sees the current value, not the stale ssr payload', async () => {
    await seed('locale', 'it')
    const [, setA] = useSmartState('en', { payloadKey: 'locale' })
    setA('fr')
    const [late] = useSmartState('en', { payloadKey: 'locale' })
    expect(late.value).toBe('fr')
  })

  it('localStorage-persisted value does not diverge from the server-rendered value during hydration', async () => {
    // server cannot read localStorage, so it rendered and shipped the initial value
    resetNuxtApp({ hydrating: true })
    await seed('theme', 'light')
    localStorage.setItem('theme', '"dark"')
    const [theme] = useSmartState('light', { persist: true, storageKey: 'theme' })
    // hydration reads theme.value synchronously: it must equal what the server rendered
    expect(theme.value).toBe('light')
  })
})
