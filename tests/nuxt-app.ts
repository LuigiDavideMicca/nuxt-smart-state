// Stand-in for Nuxt's `#app` (aliased in vitest.config.ts): payload state,
// a nuxtApp with isHydrating and hooks, and the current request event.
import { ref, type Ref } from 'vue'

export const payload = new Map<string, Ref<unknown>>()

type Hook = () => void
const createNuxtApp = (isHydrating: boolean, prerendered = false) => {
  const hooks = new Map<string, Hook[]>()
  return {
    isHydrating,
    payload: prerendered ? { prerenderedAt: Date.now() } : {},
    hooks: {
      hookOnce: (name: string, hook: Hook) => {
        hooks.set(name, [...(hooks.get(name) ?? []), hook])
      },
      callHook: (name: string) => {
        const pending = hooks.get(name) ?? []
        hooks.delete(name)
        pending.forEach((hook) => hook())
      }
    }
  }
}

let nuxtApp = createNuxtApp(false)
let requestEvent: unknown

export const resetNuxtApp = ({
  hydrating = false,
  prerendered = false,
  event
}: { hydrating?: boolean; prerendered?: boolean; event?: unknown } = {}) => {
  payload.clear()
  nuxtApp = createNuxtApp(hydrating, prerendered)
  requestEvent = event
}

/** Ends hydration the way Nuxt does once the root suspense resolves. */
export const finishHydration = () => {
  nuxtApp.isHydrating = false
  nuxtApp.hooks.callHook('app:suspense:resolve')
}

export const seed = (key: string, value: unknown) => {
  payload.set(`smart-state:${key}`, ref(value))
}

export const useNuxtApp = () => nuxtApp

export const useRequestEvent = () => requestEvent

export const useState = (key: string, init?: () => unknown) => {
  if (!payload.has(key)) payload.set(key, ref(init?.()))
  return payload.get(key)
}
