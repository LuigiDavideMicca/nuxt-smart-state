import { useState as useNuxtState } from 'nuxt/app'
import {
  useState,
  type SetState,
  type UseStateOptions,
  type UseStateReturn
} from 'vue-smart-state'

export type UseSmartStateOptions<T> = UseStateOptions<T> & {
  /**
   * Transfer the server-rendered value to the client through the Nuxt
   * payload (like Nuxt's own useState). Defaults to the storageKey.
   * Set to false to opt out. Requires a JSON-serializable value.
   */
  payloadKey?: string | false
}

export function useSmartState<T>(
  initialValue: T,
  options: UseSmartStateOptions<T> = {}
): UseStateReturn<T> {
  const { payloadKey, ...rest } = options
  const key = payloadKey === false ? undefined : (payloadKey ?? rest.storageKey)

  if (!key) return useState(initialValue, rest)

  const payload = useNuxtState<T>(`smart-state:${key}`, () => initialValue)

  if (import.meta.server) {
    // Server: write straight to the payload ref so the value ships to the client.
    const set: SetState<T> = (next) => {
      payload.value =
        typeof next === 'function' ? (next as (current: T) => T)(payload.value as T) : next
    }
    return [
      payload as UseStateReturn<T>[0],
      set,
      { reset: () => set(initialValue), clear: () => set(initialValue) }
    ]
  }

  // Client: the payload value becomes the initial one; a value persisted on
  // this device still wins (the visitor's own choice beats the server default).
  return useState(payload.value as T, rest)
}
