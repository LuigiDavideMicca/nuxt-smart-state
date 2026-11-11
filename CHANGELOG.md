# Changelog

## [0.3.0](https://github.com/LuigiDavideMicca/nuxt-smart-state/compare/v0.2.0...v0.3.0) (2026-11-11)


### ⚠ BREAKING CHANGES

* reset() and clear() return to the initial value, not the server's; with localStorage or sessionStorage the stored value arrives after mount on server-rendered pages; calls with one key share one state and the first call's options; server-side sets persist (Set-Cookie); useCookieStorage() encodes cookie names; requires Nuxt 3.15 or later with nuxt as a peer dependency; the smartState config key is gone.

### Features

* hydration without mismatch, server writes that persist, and state shared per key ([4ff7461](https://github.com/LuigiDavideMicca/nuxt-smart-state/commit/4ff7461ffee6b6b48f7e7bd088a0f5d7fcaedd75))

## [0.2.0](https://github.com/LuigiDavideMicca/nuxt-smart-state/compare/v0.1.0...v0.2.0) (2026-07-28)


### Features

* adopt vue-smart-state 0.2 with ssr storage reads and payload validation ([dedf151](https://github.com/LuigiDavideMicca/nuxt-smart-state/commit/dedf151633b1effe8b499b3e7693b216e6039db1))
