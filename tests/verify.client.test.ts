import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, createSSRApp, defineComponent, h, nextTick, type Ref } from 'vue'
import { finishHydration, payload, resetNuxtApp, seed } from './nuxt-app'
import { memoryStorage } from './helpers'
import { useSmartState } from '../src/runtime/useSmartState'
import { useCookieStorage } from '../src/runtime/useCookieStorage'

// found by the verifier of the 0.3 fixes
describe('verification round', () => {
  afterEach(() => {
    document.cookie = 'theme=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('releases a key when the last component using it unmounts', () => {
    resetNuxtApp()
    const refs: Ref<unknown>[] = []
    const mount = () => {
      const app = createApp(
        defineComponent({
          setup() {
            refs.push(useSmartState(0, { payloadKey: 'dyn-1' })[0] as Ref<unknown>)
            return () => h('i')
          }
        })
      )
      app.mount(document.createElement('div'))
      return app
    }
    const a = mount()
    const b = mount()
    expect(refs[1]).toBe(refs[0]) // shared while in use
    a.unmount()
    b.unmount()
    mount().unmount()
    expect(refs[2]).not.toBe(refs[0]) // released: the components it held can be collected
  })

  it('keeps the value a released key had, from the payload', () => {
    resetNuxtApp()
    const read: unknown[] = []
    const mount = (write?: number) => {
      const app = createApp(
        defineComponent({
          setup() {
            const [n, setN] = useSmartState(0, { payloadKey: 'dyn-2' })
            if (write !== undefined) setN(write)
            read.push(n.value)
            return () => h('i')
          }
        })
      )
      app.mount(document.createElement('div'))
      return app
    }
    mount(7).unmount()
    mount().unmount()
    expect(read).toEqual([7, 7])
  })

  it('a prerendered page applies a cookie after mount, without a mismatch', async () => {
    resetNuxtApp({ hydrating: true, prerendered: true })
    document.cookie = `theme=${encodeURIComponent('"dark"')}; path=/`
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = document.createElement('div')
    container.innerHTML = '<p class="light">light</p>'
    createSSRApp(
      defineComponent({
        setup() {
          const [theme] = useSmartState('light', {
            persist: true,
            storageKey: 'theme',
            storage: useCookieStorage()
          })
          return () => h('p', { class: theme.value }, theme.value)
        }
      })
    ).mount(container)
    await nextTick()
    const mismatches = [...warn.mock.calls, ...error.mock.calls].filter((call) =>
      /hydration/i.test(String(call[0]))
    )
    warn.mockRestore()
    error.mockRestore()
    expect(mismatches).toEqual([])
    finishHydration()
    await nextTick()
    expect(container.innerHTML).toBe('<p class="dark">dark</p>')
  })

  it('an undefined the server set is what the client renders', () => {
    resetNuxtApp({ hydrating: false })
    payload.set('smart-state:sv:unset', { value: true } as unknown as Ref<unknown>)
    const [v] = useSmartState<string | undefined>('init', { payloadKey: 'sv' })
    expect(v.value).toBeUndefined()
  })

  it('an expired stored entry equal to the initial value lets the server value in', () => {
    resetNuxtApp()
    seed('locale', 'it')
    const storage = memoryStorage({
      locale: JSON.stringify({ __vss: 1, value: '"en"', expires: Date.now() - 1000 })
    })
    const [locale] = useSmartState('en', { persist: true, storageKey: 'locale', storage, ttl: 60_000 })
    expect(locale.value).toBe('it')
  })
})
