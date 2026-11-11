import { useNuxtApp, useState as useNuxtState } from '#app'
import {
  computed,
  customRef,
  effectScope,
  getCurrentInstance,
  onMounted,
  onUnmounted,
  ref,
  toRaw,
  watch,
  type Ref
} from 'vue'
import {
  useState,
  type SetState,
  type StorageLike,
  type UseStateControls,
  type UseStateOptions,
  type UseStateReturn
} from 'vue-smart-state'
import { isServer, isServerReadable } from './shared'

export { cookieStorage } from 'vue-smart-state'
export type {
  CookieStorageOptions,
  Serializer,
  SetState,
  StandardSchemaResult,
  StandardSchemaV1,
  StorageLike,
  UseStateControls,
  UseStateOptions,
  UseStateReturn
} from 'vue-smart-state'

export type UseSmartStateOptions<T> = UseStateOptions<T> & {
  /**
   * Transfer the server-rendered value to the client through the Nuxt
   * payload (like Nuxt's own useState). Defaults to the storageKey.
   * Set to false to opt out. Requires a JSON-serializable value.
   */
  payloadKey?: string | false
}

type Resolvable<T> = T | ((current: T) => T)

const resolve = <T>(next: Resolvable<T>, current: T): T =>
  typeof next === 'function' ? (next as (current: T) => T)(current) : next

const clone = <T>(value: T): T => {
  if (value === null || typeof value !== 'object') return value
  try {
    return structuredClone(toRaw(value))
  } catch {
    return value
  }
}

const sameJson = (a: unknown, b: unknown): boolean => {
  try {
    return JSON.stringify(toRaw(a)) === JSON.stringify(toRaw(b))
  } catch {
    return false
  }
}

/** The serialized value inside a stored entry, or undefined when it expired or has another version. */
const unwrapEnvelope = (raw: string, version?: number): string | undefined => {
  try {
    const parsed = JSON.parse(raw) as { __vss?: unknown; value?: unknown; expires?: unknown; v?: unknown }
    if (parsed && parsed.__vss === 1 && typeof parsed.value === 'string') {
      if (typeof parsed.expires === 'number' && Date.now() > parsed.expires) return undefined
      if (version !== undefined && (parsed.v ?? 0) !== version) return undefined
      return parsed.value
    }
  } catch {
    // a plain serialized value
  }
  return version !== undefined && version !== 0 ? undefined : raw
}

const resolveStorage = <T>(options: UseStateOptions<T>): StorageLike | undefined => {
  const { persist, storageKey, storage, storageType = 'local' } = options
  if (!persist || !storageKey) return undefined
  if (storage || isServer) return storage
  try {
    return storageType === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return undefined
  }
}

/** The string vue-smart-state persists for a value: plain, or an envelope with a ttl/version. */
const encodeFor = <T>(value: T, options: UseStateOptions<T>): string => {
  const written = options.serializer ? options.serializer.write(value) : JSON.stringify(value)
  const { ttl, version } = options
  if (ttl === undefined && version === undefined) return written
  return JSON.stringify({
    __vss: 1,
    value: written,
    ...(ttl !== undefined && { expires: Date.now() + ttl }),
    ...(version !== undefined && { v: version })
  })
}

/**
 * Payload values crossed the server→client wire, so they get the same
 * validation as values hydrated from storage: schema wins over parse,
 * failures mean "no payload". version/migrate/mergeDefaults don't apply —
 * the payload was produced by this very deploy.
 */
const validatePayload = <T>(value: T, options: UseStateOptions<T>): T | undefined => {
  const { schema, parse, storageKey = '', onError } = options
  try {
    if (schema) {
      const result = schema['~standard'].validate(value)
      if (result instanceof Promise) {
        console.error(
          `[nuxt-smart-state] async schema validation is not supported for key "${storageKey}" — keeping the initial value`
        )
        return undefined
      }
      return result.issues ? undefined : result.value
    }
    return parse ? parse(value) : value
  } catch (error) {
    if (onError) onError(error, 'read')
    else console.warn(`[nuxt-smart-state] read failed for key "${storageKey}"`, error)
    return undefined
  }
}

const payloadKeyOf = (key: string) => `smart-state:${key}`
const unsetKeyOf = (key: string) => `smart-state:${key}:unset`

/**
 * Server: storage is read once, the value travels in the payload, and every
 * set — setState, `.value =`, reset(), clear() — is written to the storage
 * explicitly (a cookie storage answers with Set-Cookie). Watchers do not run
 * during SSR, and cross-tab sync and debouncing have no meaning per request.
 */
function useServerState<T>(
  initialValue: T,
  options: UseStateOptions<T>,
  key: string | undefined
): UseStateReturn<T> {
  const serverOptions: UseStateOptions<T> = {
    ...options,
    syncTabs: false,
    writeDebounce: undefined,
    hydrate: 'immediate'
  }
  const [read] = useState(initialValue, serverOptions)
  const target = (
    key ? useNuxtState<T>(payloadKeyOf(key), () => read.value as T) : ref(read.value)
  ) as Ref<T>
  const storage = resolveStorage(options)
  const storageKey = options.storageKey ?? ''

  const persist = (value: T) => {
    if (!storage) return
    try {
      if (value === undefined) storage.removeItem(storageKey)
      else storage.setItem(storageKey, encodeFor(toRaw(value) as T, options))
    } catch (error) {
      if (options.onError) options.onError(error, 'write')
      else console.warn(`[nuxt-smart-state] write failed for key "${storageKey}"`, error)
    }
  }

  const unset = key ? useNuxtState<boolean>(unsetKeyOf(key), () => false) : undefined
  const state = computed<T>({
    get: () => target.value,
    set: (value) => {
      target.value = value
      if (unset) unset.value = value === undefined
      persist(value)
    }
  })
  const setState: SetState<T> = (next) => {
    state.value = resolve(next, toRaw(target.value) as T)
  }
  const controls: UseStateControls = {
    reset: () => {
      state.value = clone(initialValue)
    },
    clear: () => {
      target.value = clone(initialValue)
      if (!storage) return
      try {
        storage.removeItem(storageKey)
      } catch (error) {
        options.onError?.(error, 'write')
      }
    },
    flush: () => {}
  }
  return [state as unknown as UseStateReturn<T>[0], setState, controls]
}

type NuxtApp = ReturnType<typeof useNuxtApp>

const afterHydration = (nuxtApp: NuxtApp, callback: () => void) => {
  if (getCurrentInstance()) onMounted(callback)
  else if (nuxtApp.hooks) nuxtApp.hooks.hookOnce('app:suspense:resolve', callback)
  else callback()
}

/**
 * Client: vue-smart-state owns the state, with the real initial value (reset,
 * clear, expiry and removals elsewhere go back to it). The payload seeds it
 * when storage holds nothing usable. While the page hydrates, a storage the
 * server could not read is applied only after mount, so the first client
 * render matches the server's HTML.
 */
function useClientState<T>(
  initialValue: T,
  options: UseStateOptions<T>,
  key: string | undefined,
  nuxtApp: NuxtApp
): UseStateReturn<T> {
  const storage = resolveStorage(options)
  const storageKey = options.storageKey ?? ''
  const prerendered = Boolean((nuxtApp.payload as { prerenderedAt?: unknown } | undefined)?.prerenderedAt)
  const defer =
    storage !== undefined &&
    nuxtApp.isHydrating === true &&
    (prerendered || !isServerReadable(storage)) &&
    options.hydrate === undefined

  const result = useState(initialValue, defer ? { ...options, hydrate: 'mounted' } : options)
  if (!key) return result
  const [state, set, controls] = result

  const payload = useNuxtState<T | undefined>(payloadKeyOf(key))
  // the server set undefined on purpose: render that, not the initial value
  const serverUnset = useNuxtState<boolean>(unsetKeyOf(key), () => false).value === true
  const fromServer =
    payload.value === undefined ? undefined : validatePayload(payload.value as T, options)
  const seeded = serverUnset || (fromServer !== undefined && !sameJson(fromServer, initialValue))
  watch(state, (value) => (payload.value = value as T), { flush: 'sync' })

  // what storage holds, as far as it is usable: the state left the initial
  // value, or the entry is literally the initial value someone stored
  const storageHasValue = (): boolean => {
    if (!storage) return false
    let raw: string | null
    try {
      raw = storage.getItem(storageKey)
    } catch {
      return false
    }
    if (raw === null) return false
    if (!sameJson(state.value, initialValue)) return true
    const write = options.serializer?.write ?? JSON.stringify
    try {
      return unwrapEnvelope(raw, options.version) === write(clone(initialValue))
    } catch {
      return false
    }
  }

  const seed = () => {
    if (seeded && !storageHasValue())
      state.value = (serverUnset ? undefined : clone(fromServer)) as typeof state.value
  }

  if (!defer) {
    seed()
    return result
  }

  // hydrating: show what the server rendered until storage is applied
  let showServer = true
  const server = (serverUnset ? undefined : seeded ? fromServer : clone(initialValue)) as T
  let triggerView = () => {}
  const view = customRef<T>((track, trigger) => {
    triggerView = trigger
    return {
      get: () => {
        track()
        return showServer ? server : (state.value as T)
      },
      set: (value) => {
        showServer = false
        state.value = value as typeof state.value
        trigger()
      }
    }
  })
  const leaveServerView = () => {
    if (!showServer) return
    showServer = false
    triggerView()
  }
  afterHydration(nuxtApp, () => {
    if (!showServer) return
    seed()
    leaveServerView()
  })

  const setState: SetState<T> = (next) => {
    if (!showServer) return set(next)
    const resolved = resolve(next, clone(server))
    leaveServerView()
    set(() => resolved)
  }
  return [
    view as unknown as UseStateReturn<T>[0],
    setState,
    {
      reset: () => {
        leaveServerView()
        controls.reset()
      },
      clear: () => {
        leaveServerView()
        controls.clear()
      },
      flush: controls.flush
    }
  ]
}

// one client instance per key per app, shared by every consumer like Nuxt's useState
interface SharedEntry {
  result: UseStateReturn<unknown>
  scope: ReturnType<typeof effectScope>
  users: number
  pinned: boolean
}
const shared = new WeakMap<object, Map<string, SharedEntry>>()

export function useSmartState<T>(
  initialValue: T,
  options: UseSmartStateOptions<T> = {}
): UseStateReturn<T> {
  const { payloadKey, ...rest } = options
  const key = payloadKey === false ? undefined : payloadKey || rest.storageKey || undefined

  if (isServer) return useServerState(initialValue, rest, key)

  const nuxtApp = useNuxtApp()
  if (!key) return useClientState(initialValue, rest, undefined, nuxtApp)

  let instances = shared.get(nuxtApp)
  if (!instances) shared.set(nuxtApp, (instances = new Map()))
  const registry = instances
  let entry = registry.get(key)
  if (!entry) {
    // the instance outlives the component that created it, as the shared
    // state does, until the last component using the key goes; its value
    // stays in the payload and in storage for the next one
    const scope = effectScope(true)
    const result = scope.run(() => useClientState(initialValue, rest, key, nuxtApp))!
    entry = { result: result as UseStateReturn<unknown>, scope, users: 0, pinned: false }
    registry.set(key, entry)
    nuxtApp.vueApp?.onUnmount?.(() => scope.stop())
  }
  const current = entry
  if (getCurrentInstance()) {
    current.users++
    onUnmounted(() => {
      current.users--
      if (current.users === 0 && !current.pinned && registry.get(key) === current) {
        current.scope.stop()
        registry.delete(key)
      }
    })
  } else {
    // used outside a component (a plugin, a store): kept for the app's life
    current.pinned = true
  }
  return current.result as UseStateReturn<T>
}
