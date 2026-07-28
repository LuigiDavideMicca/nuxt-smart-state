// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useState } from 'vue-smart-state'

const { jar, cookieCalls } = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  cookieCalls: [] as string[]
}))

vi.mock('nuxt/app', async () => {
  const { ref, watch } = await import('vue')
  return {
    useCookie: (key: string, opts: { decode?: (v: string) => unknown; encode?: (v: never) => string } = {}) => {
      cookieCalls.push(key)
      const raw = jar.get(key)
      const cookie = ref(raw === undefined ? null : (opts.decode ?? ((v: string) => v))(raw))
      watch(
        cookie,
        (value) => {
          if (value === null || value === undefined) jar.delete(key)
          else jar.set(key, (opts.encode ?? ((v: never) => String(v)))(value as never))
        },
        { flush: 'sync' }
      )
      return cookie
    }
  }
})

import { useCookieStorage } from '../src/runtime/useCookieStorage'

beforeEach(() => {
  jar.clear()
  cookieCalls.length = 0
})

describe('useCookieStorage', () => {
  it('returns null for a missing cookie', () => {
    expect(useCookieStorage().getItem('theme')).toBeNull()
  })

  it('round-trips values, uri-encoded like cookieStorage', () => {
    const storage = useCookieStorage()
    storage.setItem('theme', '"dark"')
    expect(storage.getItem('theme')).toBe('"dark"')
    expect(jar.get('theme')).toBe('%22dark%22')
  })

  it('reads what cookieStorage wrote', () => {
    jar.set('theme', encodeURIComponent('"dark"'))
    expect(useCookieStorage().getItem('theme')).toBe('"dark"')
  })

  it('removeItem deletes the cookie', () => {
    const storage = useCookieStorage()
    storage.setItem('theme', '"dark"')
    storage.removeItem('theme')
    expect(storage.getItem('theme')).toBeNull()
    expect(jar.has('theme')).toBe(false)
  })

  it('creates a single cookie ref per key', () => {
    const storage = useCookieStorage()
    storage.getItem('theme')
    storage.setItem('theme', '"dark"')
    storage.getItem('theme')
    expect(cookieCalls).toEqual(['theme'])
  })

  it('lets useState render the cookie value during ssr', async () => {
    jar.set('theme', encodeURIComponent('"dark"'))
    const [theme, setTheme] = useState('light', {
      persist: true,
      storageKey: 'theme',
      storage: useCookieStorage()
    })
    expect(theme.value).toBe('dark')

    setTheme('sepia')
    await nextTick()
    expect(jar.get('theme')).toBe(encodeURIComponent('"sepia"'))
  })
})
