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

`useCookieStorage()` (auto-imported) is a `StorageLike` over Nuxt's `useCookie`: the server reads the request cookies (and can set response cookies), the client reads and writes `document.cookie`. Call it during setup — it needs the Nuxt context. It takes the same options as vue-smart-state's `cookieStorage` (`days`, `path`, `sameSite`, `secure`) and writes the same wire format, so both can read each other's cookies. Outside setup (module-level stores), reach for the plain `cookieStorage()` instead — also auto-imported, client-only reads.

## Usage

`useSmartState` is auto-imported everywhere — no import statement needed:

```vue
<script setup lang="ts">
const [prefs, setPrefs] = useSmartState({ compact: false, perPage: 20 }, {
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

Every [`vue-smart-state` option](https://github.com/LuigiDavideMicca/vue-smart-state#options) passes straight through: `persist`, `storageType`, `storage`, `ttl`, `writeDebounce`, `serializer`, `schema`, `parse`, `version`, `migrate`, `mergeDefaults`, `syncTabs` (incl. `'broadcast'`), `shallow`, `deepWatch`, `onError` — plus the `reset()`/`clear()` controls as the third tuple element. The `StorageLike`, `StandardSchemaV1` and `UseSmartStateOptions` types are auto-imported too.

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

Precedence on the client is deliberate: **a value the visitor persisted on their device wins over the server-computed one**, which wins over the initial value. Payload transfer is keyed on `storageKey` (override with `payloadKey`, or disable it with `payloadKey: false`); like Nuxt's `useState`, it requires JSON-serializable values.

Payload values crossed the server → client wire, so they get the same treatment as values hydrated from storage: `schema` (or `parse`) validates them on the client, and rejected values fall back to the initial one. `version`/`migrate`/`mergeDefaults` don't apply to the payload — it was produced by the same deploy that reads it.

## Cross-framework interop

The persisted format is shared across the whole family — [`smart-state`](https://github.com/LuigiDavideMicca/smart-state) (React), [`vue-smart-state`](https://github.com/LuigiDavideMicca/vue-smart-state) and this module: plain JSON without TTL/version, the `{ "__vss": 1, "value": "…", "expires": …, "v": … }` envelope otherwise. A React app and a Nuxt app on the same origin can share persisted state, TTLs and versions out of the box, in both directions.

## Why the alias?

Nuxt already ships its own `useState` — a *server-side, payload-shared* state primitive. This module deliberately auto-imports the composable as **`useSmartState`** so the two never collide:

| | Nuxt `useState` | `useSmartState` |
| --- | --- | --- |
| Shared server → client via payload | ✅ | ✅ |
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
