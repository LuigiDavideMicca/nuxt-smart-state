import { useCookie } from 'nuxt/app'
import type { Ref } from 'vue'
import type { CookieStorageOptions, StorageLike } from 'vue-smart-state'

/**
 * A `StorageLike` over Nuxt's `useCookie`: the server reads the request
 * cookies (and sets response cookies), the client reads and writes
 * `document.cookie`. Same wire format as vue-smart-state's `cookieStorage`,
 * so either side can read what the other wrote.
 * Call it during setup — it needs the Nuxt context.
 */
export function useCookieStorage(options: CookieStorageOptions = {}): StorageLike {
  const { days = 365, path = '/', sameSite = 'lax', secure = false } = options
  const cookies = new Map<string, Ref<string | null | undefined>>()

  const cookieFor = (key: string): Ref<string | null | undefined> => {
    let cookie = cookies.get(key)
    if (!cookie) {
      cookie = useCookie<string | null>(key, {
        maxAge: days * 86_400,
        path,
        sameSite,
        secure: secure || sameSite === 'none',
        decode: decodeURIComponent,
        encode: (value) => encodeURIComponent(value ?? '')
      })
      cookies.set(key, cookie)
    }
    return cookie
  }

  return {
    getItem: (key) => cookieFor(key).value ?? null,
    setItem: (key, value) => {
      cookieFor(key).value = value
    },
    removeItem: (key) => {
      cookieFor(key).value = null
    }
  }
}
