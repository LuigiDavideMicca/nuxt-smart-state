// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, nextTick } from 'vue'
import { resetNuxtApp } from './nuxt-app'
import { renderToString } from 'vue/server-renderer'
import { memoryStorage } from './helpers'

import { useSmartState } from '../src/runtime/useSmartState'

beforeEach(() => {
  resetNuxtApp()
})

describe('hunt: server', () => {
  it('setState during ssr setup persists to the storage (cookie -> Set-Cookie)', async () => {
    const storage = memoryStorage()
    const App = defineComponent({
      setup() {
        const [theme, setTheme] = useSmartState('light', { persist: true, storageKey: 'theme', storage })
        setTheme('dark')
        return () => h('div', theme.value)
      }
    })
    const html = await renderToString(createSSRApp(App))
    expect(html).toBe('<div>dark</div>')
    await nextTick()
    expect(storage.getItem('theme')).toBe('"dark"')
  })

  it('setState outside a component on the server (plugin/middleware) persists to storage', async () => {
    const storage = memoryStorage()
    const [, setTheme] = useSmartState('light', { persist: true, storageKey: 'theme', storage })
    setTheme('dark')
    await nextTick()
    expect(storage.getItem('theme')).toBe('"dark"')
  })

  describe('syncTabs: broadcast on the server', () => {
    const Real = globalThis.BroadcastChannel
    let open = 0
    beforeEach(() => {
      open = 0
      class Counting extends Real {
        constructor(name: string) {
          super(name)
          open++
        }
        close() {
          open--
          super.close()
        }
      }
      globalThis.BroadcastChannel = Counting as typeof BroadcastChannel
    })
    afterEach(() => {
      globalThis.BroadcastChannel = Real
    })

    it('does not leave a BroadcastChannel open per SSR request', async () => {
      const App = defineComponent({
        setup() {
          const [theme] = useSmartState('light', {
            persist: true,
            storageKey: 'theme',
            storage: memoryStorage({ theme: '"dark"' }),
            syncTabs: 'broadcast'
          })
          return () => h('div', theme.value)
        }
      })
      for (let i = 0; i < 20; i++) {
        resetNuxtApp()
        const app = createSSRApp(App)
        await renderToString(app)
      }
      expect(open).toBe(0)
    })

    it("one request's server-side reset() is not broadcast process-wide to other requests", async () => {
      const received: unknown[] = []
      const otherRequest = new Real('vss:theme')
      otherRequest.onmessage = (e) => received.push(e.data)
      const [, , { reset }] = useSmartState('light', {
        persist: true,
        storageKey: 'theme',
        storage: memoryStorage({ theme: '"dark"' }),
        syncTabs: 'broadcast'
      })
      reset()
      await new Promise((r) => setTimeout(r, 50))
      otherRequest.close()
      expect(received).toEqual([])
    })
  })
})
