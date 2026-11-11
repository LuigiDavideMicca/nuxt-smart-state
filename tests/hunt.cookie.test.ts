import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { cookieStorage, useState } from 'vue-smart-state'

import { useCookieStorage } from '../src/runtime/useCookieStorage'

beforeEach(() => {
  for (const name of document.cookie.split(';').map((p) => p.split('=')[0]?.trim()).filter(Boolean)) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
})

describe('hunt: useCookieStorage', () => {
  it('flushes a pending debounced write when the component unmounts', () => {
    vi.useFakeTimers()
    const scope = effectScope()
    scope.run(() => {
      const [, setDraft] = useState('', {
        persist: true,
        storageKey: 'draft',
        storage: useCookieStorage(),
        writeDebounce: 2000
      })
      setDraft('hello')
    })
    // vue's watcher runs pre-flush; trigger it, then unmount inside the debounce window
    return Promise.resolve().then(() => {
      scope.stop()
      vi.useRealTimers()
      expect(document.cookie).toContain('draft=%22hello%22')
    })
  })

  it('reads a cookie that cookieStorage wrote for a key that needs encoding', () => {
    cookieStorage().setItem('my theme', '"dark"')
    expect(useCookieStorage().getItem('my theme')).toBe('"dark"')
  })

  it('writes a cookie for a key that needs encoding that cookieStorage reads', () => {
    useCookieStorage().setItem('my theme', '"dark"')
    expect(document.cookie).toContain('my%20theme=%22dark%22')
    expect(cookieStorage().getItem('my theme')).toBe('"dark"')
  })
})
