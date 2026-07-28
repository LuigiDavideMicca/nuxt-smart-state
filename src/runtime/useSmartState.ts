import { useState as useNuxtState } from 'nuxt/app'
import {
  useState,
  type SetState,
  type UseStateOptions,
  type UseStateReturn
} from 'vue-smart-state'

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

const isServer = import.meta.server ?? typeof window === 'undefined'

const makeSet =
  <T>(target: { value: T }): SetState<T> =>
  (next) => {
    target.value = typeof next === 'function' ? (next as (current: T) => T)(target.value) : next
  }

/**
 * Payload values crossed the server→client wire, so they get the same
 * validation as values hydrated from storage: schema wins over parse,
 * failures fall back to the initial value. version/migrate/mergeDefaults
 * don't apply — the payload was produced by this very deploy.
 */
const validatePayload = <T>(value: T, initialValue: T, options: UseStateOptions<T>): T => {
  const { schema, parse, storageKey = '', onError } = options
  try {
    if (schema) {
      const result = schema['~standard'].validate(value)
      if (result instanceof Promise) {
        console.error(
          `[nuxt-smart-state] async schema validation is not supported for key "${storageKey}" — keeping the initial value`
        )
        return initialValue
      }
      return result.issues ? initialValue : result.value
    }
    return parse ? parse(value) : value
  } catch (error) {
    if (onError) onError(error, 'read')
    else console.warn(`[nuxt-smart-state] read failed for key "${storageKey}"`, error)
    return initialValue
  }
}

export function useSmartState<T>(
  initialValue: T,
  options: UseSmartStateOptions<T> = {}
): UseStateReturn<T> {
  const { payloadKey, ...rest } = options
  const key = payloadKey === false ? undefined : (payloadKey ?? rest.storageKey)

  if (isServer) {
    // A custom `storage` (e.g. useCookieStorage) is read on the server too,
    // so the render starts from the persisted value — no flash on first paint.
    const result = useState(initialValue, rest)
    if (!key) return result
    const [state, , controls] = result

    // The payload ref is the state on the server, so every write — setState or
    // direct .value assignment — ships to the client (like Nuxt's useState).
    const payload = useNuxtState<T>(`smart-state:${key}`, () => state.value as T)
    const set = makeSet(payload as { value: T })
    return [
      payload as UseStateReturn<T>[0],
      set,
      {
        reset: () => {
          set(initialValue)
          controls.reset()
        },
        clear: () => {
          set(initialValue)
          controls.clear()
        }
      }
    ]
  }

  if (!key) return useState(initialValue, rest)

  // Client: the payload value becomes the initial one; a value persisted on
  // this device still wins (the visitor's own choice beats the server default).
  const payload = useNuxtState<T>(`smart-state:${key}`, () => initialValue)
  return useState(validatePayload(payload.value as T, initialValue, rest), rest)
}
