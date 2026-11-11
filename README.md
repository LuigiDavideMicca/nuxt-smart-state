# nuxt-smart-state

Nuxt 3/4 module for [`vue-smart-state`](https://github.com/LuigiDavideMicca/vue-smart-state): an auto-imported, SSR-safe `useSmartState` composable with persistence, cookie storage without hydration flash, schema validation (Standard Schema: Zod 4, Valibot, ArkType…), versioned migrations, cross-tab sync, TTL expiry and debounced writes. Zero configuration.

[![npm](https://img.shields.io/npm/v/nuxt-smart-state)](https://www.npmjs.com/package/nuxt-smart-state)
[![license](https://img.shields.io/npm/l/nuxt-smart-state)](./LICENSE)

## Installation

```bash
npm install nuxt-smart-state
# or: pnpm add / bun add / yarn add
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-smart-state']
})
```

Works with Nuxt 3.15+ and Nuxt 4. The module has no options.

## No flash of the wrong theme

The flagship recipe. `localStorage` is invisible to the server, so a persisted theme normally flashes from the default to the real one on hydration. Cookies travel with the request — store the state in one and the server renders the right value on first paint:

```vue
<script setup lang="ts">
const [theme, setTheme] = useSmartState<'light' | 'dark'>('light', {
  persist: true,
  storageKey: 'theme',
  storage: useCookieStorage()
})
</script>
```

`useCookieStorage()` (auto-imported) is a `StorageLike` the server can read:

- **On the server** it reads the cookies of the incoming request and answers every write with a `Set-Cookie` header. It needs the request, so call it where the Nuxt context is available (setup, plugins, route middleware).
- **On the client** it is vue-smart-state's `cookieStorage()` over `document.cookie`, so it keeps working after the component that created it is gone (a debounced write still lands after navigating away).

It takes the same options as `cookieStorage` (`days`, `path`, `sameSite`, `secure`) and writes the same format — cookie name and value both `encodeURIComponent`-encoded — so either can read what the other wrote.

The plain `cookieStorage()` is auto-imported too, but the server cannot read it: a page using it renders the initial value and switches to the cookie value after hydration (a flash). Use it for client-only state; use `useCookieStorage()` whenever the server should render the stored value.

## Usage

`useSmartState` is auto-imported everywhere — no import statement needed:

```vue
<script setup lang="ts">
const [prefs, setPrefs, { reset, clear, flush }] = useSmartState({ compact: false, perPage: 20 }, {
  persist: true,
  storageKey: 'prefs',
  syncTabs: 'broadcast',
  version: 2,
  migrate: (old, from) => (from === 1 ? upgrade(old) : undefined),
  schema: prefsSchema, // any Standard Schema: Zod 4, Valibot, ArkType…
  mergeDefaults: true
})
</script>
```

Every [`vue-smart-state` option](https://github.com/LuigiDavideMicca/vue-smart-state#options) passes straight through: `persist`, `storageType`, `storage`, `ttl`, `writeDebounce`, `serializer`, `schema`, `parse`, `version`, `migrate`, `mergeDefaults`, `syncTabs` (incl. `'broadcast'`), `shallow`, `deepWatch`, `hydrate`, `onError`. The third tuple element holds the controls:

- `reset()` — back to the **initial value** you passed (persisted too),
- `clear()` — removes the stored entry and goes back to the initial value,
- `flush()` — writes a pending debounced value now.

A value that expires (`ttl`) or is removed in another tab also falls back to the initial value — never to the value the server sent.

The `StorageLike`, `StandardSchemaV1`, `UseSmartStateOptions`, `CookieStorageOptions`, `SetState` and `UseStateControls` types are auto-imported too.

### One state per key

Like Nuxt's `useState`, every `useSmartState` call with the same key (`payloadKey`, or `storageKey` when there is none) gets the same state on the server and on the client: two components using `theme` see each other's changes, and a component mounted later sees the current value. The first call creates the state, so its initial value and options apply; later calls with the same key reuse it. Give every call for one key the same options: on the server each call writes through its own storage options, so differing ones disagree between server and client. The shared state is released when the last component using it unmounts — its value stays in the payload and in storage for the next one — so dynamic keys (`'post-' + id`) do not pile up. With `payloadKey: false` each call gets its own instance (instances persisting under the same storage and key still stay in sync, through vue-smart-state).

## Server → client payload, included

Values set during SSR travel to the client through the Nuxt payload — like Nuxt's own `useState` — and *then* keep all the smart behaviour on the client:

```ts
const [locale, setLocale] = useSmartState('en', {
  persist: true,
  storageKey: 'locale'
})

if (import.meta.server) {
  setLocale(detectFromHeaders()) // reaches the client in the payload
}
```

Precedence on the client is deliberate: **a value the visitor persisted on their device wins over the server-computed one**, which wins over the initial value. The payload only fills in when storage holds nothing usable (nothing stored, expired, or rejected by `schema`/`parse`); a server value adopted that way is then persisted on the device. Payload transfer is keyed on `storageKey` (override with `payloadKey`, or disable it with `payloadKey: false`); like Nuxt's `useState`, it requires JSON-serializable values.

Payload values crossed the server → client wire, so they get the same treatment as values hydrated from storage: `schema` (or `parse`) validates them on the client, and rejected values are ignored. `version`/`migrate`/`mergeDefaults` don't apply to the payload — it was produced by the same deploy that reads it.

### Setting state on the server

On the server, `setState`, `state.value = …`, `reset()` and `clear()` write through the storage right away — with `useCookieStorage()` that is a `Set-Cookie` on the response, in the same format the client writes (including the TTL/version envelope). Mutating a nested property (`state.value.compact = true`) changes the rendered value but is not persisted on the server: assign a new value instead. `syncTabs` and `writeDebounce` are ignored on the server, so no `BroadcastChannel` or timer outlives a request (and `nuxi generate` exits when it is done).

### Hydration

The first client render has to match the server's HTML. Storage the server can read (`useCookieStorage()`) is read during setup, so the page hydrates straight into the stored value — no flash. Any other storage (`localStorage`, `sessionStorage`, `cookieStorage()`, a custom one) is applied **after mount** while the page hydrates: the page first shows what the server rendered, then switches to the stored value without a hydration mismatch. On a prerendered page (`nuxi generate`) the server never saw the visitor's cookie, so `useCookieStorage()` is applied after mount there too. A page served from a shared cache (ISR, a CDN) was also rendered for someone else: keep per-visitor cookie state out of cached routes, or pass `hydrate: 'mounted'`. After hydration (client-side navigation, client-only pages) storage is read immediately. Pass `hydrate: 'immediate'` or `'mounted'` to choose yourself.

## Cross-framework interop

The persisted format is shared across the whole family — [`smart-state`](https://github.com/LuigiDavideMicca/smart-state) (React), [`vue-smart-state`](https://github.com/LuigiDavideMicca/vue-smart-state) and this module: plain JSON without TTL/version, the `{ "__vss": 1, "value": "…", "expires": …, "v": … }` envelope otherwise. A React app and a Nuxt app on the same origin can share persisted state, TTLs and versions out of the box, in both directions.

## Why the alias?

Nuxt already ships its own `useState` — a *server-side, payload-shared* state primitive. This module deliberately auto-imports the composable as **`useSmartState`** so the two never collide:

| | Nuxt `useState` | `useSmartState` |
| --- | --- | --- |
| Shared server → client via payload | ✅ | ✅ |
| One state per key across components | ✅ | ✅ |
| Persisted across sessions (storage, cookies) | ❌ | ✅ |
| Schema validation, versioned migrations | ❌ | ✅ |
| Cross-tab sync, TTL, debounced writes | ❌ | ✅ |

Reach for Nuxt's `useState` for purely per-request server state; reach for `useSmartState` when the value also belongs to the browser.

## Development

```bash
bun install && bun run test    # or: npm / pnpm / yarn
bun run typecheck
bun run build
```

## License

[MIT](./LICENSE) © [Luigi Davide Micca](https://luigimicca.com)
