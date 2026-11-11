// @vitest-environment node
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent, type H3Event } from 'h3'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useState } from 'vue-smart-state'
import { resetNuxtApp } from './nuxt-app'

import { useCookieStorage } from '../src/runtime/useCookieStorage'

const request = (cookie?: string): H3Event => {
  const req = new IncomingMessage(new Socket())
  if (cookie) req.headers.cookie = cookie
  const event = createEvent(req, new ServerResponse(req))
  resetNuxtApp({ event })
  return event
}

const setCookies = (event: H3Event): string[] =>
  [event.node.res.getHeader('set-cookie') ?? []].flat().map(String)

describe('useCookieStorage (server)', () => {
  it('returns null for a missing cookie', () => {
    request()
    expect(useCookieStorage().getItem('theme')).toBeNull()
  })

  it('round-trips values, uri-encoded like cookieStorage', () => {
    const event = request()
    const storage = useCookieStorage()
    storage.setItem('theme', '"dark"')
    expect(storage.getItem('theme')).toBe('"dark"')
    expect(setCookies(event)).toEqual([expect.stringMatching(/^theme=%22dark%22; Max-Age=31536000; /)])
  })

  it('reads what cookieStorage wrote', () => {
    request(`other=1; theme=${encodeURIComponent('"dark"')}`)
    expect(useCookieStorage().getItem('theme')).toBe('"dark"')
  })

  it('removeItem deletes the cookie', () => {
    const event = request(`theme=${encodeURIComponent('"dark"')}`)
    const storage = useCookieStorage()
    storage.removeItem('theme')
    expect(storage.getItem('theme')).toBeNull()
    expect(setCookies(event)).toEqual([expect.stringMatching(/^theme=; Max-Age=0; /)])
  })

  it('answers repeated writes with a single Set-Cookie per key, shared by every storage of the request', () => {
    const event = request()
    useCookieStorage().setItem('theme', '"dark"')
    useCookieStorage({ days: 1 }).setItem('theme', '"sepia"')
    expect(useCookieStorage().getItem('theme')).toBe('"sepia"')
    expect(setCookies(event)).toEqual([expect.stringMatching(/^theme=%22sepia%22; Max-Age=86400; /)])
  })

  it('encodes the cookie name the way cookieStorage does', () => {
    const event = request(`${encodeURIComponent('my theme')}=${encodeURIComponent('"dark"')}`)
    const storage = useCookieStorage()
    expect(storage.getItem('my theme')).toBe('"dark"')
    storage.setItem('my theme', '"sepia"')
    expect(setCookies(event)).toEqual([expect.stringMatching(/^my%20theme=%22sepia%22; /)])
  })

  it('applies the cookie options', () => {
    const event = request()
    useCookieStorage({ path: '/app', sameSite: 'none' }).setItem('theme', '"dark"')
    const [cookie] = setCookies(event)
    expect(cookie).toContain('Path=/app')
    expect(cookie).toContain('SameSite=None')
    expect(cookie).toContain('Secure')
  })

  it('is inert without a request event', () => {
    resetNuxtApp()
    const storage = useCookieStorage()
    storage.setItem('theme', '"dark"')
    expect(storage.getItem('theme')).toBeNull()
  })

  it('lets useState render the cookie value during ssr', async () => {
    const event = request(`theme=${encodeURIComponent('"dark"')}`)
    const [theme, setTheme] = useState('light', {
      persist: true,
      storageKey: 'theme',
      storage: useCookieStorage()
    })
    expect(theme.value).toBe('dark')

    setTheme('sepia')
    await nextTick()
    expect(setCookies(event)).toEqual([expect.stringMatching(/^theme=%22sepia%22; /)])
  })
})
