import { useRequestEvent } from '#app'
import { getRequestHeader, setCookie, type H3Event } from 'h3'
import { cookieStorage, type CookieStorageOptions, type StorageLike } from 'vue-smart-state'
import { isServer, markServerReadable } from './shared'

const readCookie = (header: string | undefined, key: string): string | null => {
  if (!header) return null
  const prefix = `${encodeURIComponent(key)}=`
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (!trimmed.startsWith(prefix)) continue
    try {
      return decodeURIComponent(trimmed.slice(prefix.length))
    } catch {
      return null
    }
  }
  return null
}

// one storage per options on the client, so same-tab instances of a key find each other
const clientStorages = new Map<string, StorageLike>()

type WrittenCookies = Map<string, string | null>
const writtenIn = (event: H3Event): WrittenCookies => {
  const context = event.context as { smartStateCookies?: WrittenCookies }
  return (context.smartStateCookies ??= new Map())
}

/**
 * A `StorageLike` over cookies, readable by the server: on the server it reads
 * the request cookies and answers writes with `Set-Cookie`; on the client it is
 * vue-smart-state's `cookieStorage` (`document.cookie`). Same name and value
 * encoding on both sides, so either can read what the other wrote.
 * Call it during setup (or anywhere with the Nuxt context) on the server.
 */
export function useCookieStorage(options: CookieStorageOptions = {}): StorageLike {
  const { days = 365, path = '/', sameSite = 'lax', secure = false } = options

  if (!isServer) {
    const id = JSON.stringify([days, path, sameSite, secure])
    let storage = clientStorages.get(id)
    if (!storage) {
      storage = markServerReadable(cookieStorage({ days, path, sameSite, secure }))
      clientStorages.set(id, storage)
    }
    return storage
  }

  const event = useRequestEvent()
  const write = (key: string, value: string | null) => {
    if (!event) return
    writtenIn(event).set(key, value)
    setCookie(event, encodeURIComponent(key), value ?? '', {
      encode: encodeURIComponent,
      maxAge: value === null ? 0 : Math.round(days * 86_400),
      expires: value === null ? new Date(0) : new Date(Date.now() + days * 86_400_000),
      path,
      sameSite,
      secure: secure || sameSite === 'none'
    })
  }

  return markServerReadable({
    getItem: (key) => {
      if (!event) return null
      const written = writtenIn(event)
      if (written.has(key)) return written.get(key) ?? null
      return readCookie(getRequestHeader(event, 'cookie'), key)
    },
    setItem: (key, value) => write(key, value),
    removeItem: (key) => write(key, null)
  })
}
