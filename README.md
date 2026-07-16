# nuxt-smart-state

Nuxt 3/4 module for [`vue-smart-state`](https://github.com/LuigiDavideMicca/vue-smart-state): an auto-imported, SSR-safe `useSmartState` composable with persistence, cross-tab sync, TTL expiry, custom serializers and debounced writes. Zero configuration.

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

## Usage

`useSmartState` is auto-imported everywhere — no import statement needed:

```vue
<script setup lang="ts">
const [theme, setTheme] = useSmartState<'light' | 'dark'>('light', {
  persist: true,
  storageKey: 'theme',
  syncTabs: true
})
</script>
```

All [`vue-smart-state` options](https://github.com/LuigiDavideMicca/vue-smart-state#options) are available: `persist`, `storageType`, `ttl`, `writeDebounce`, `serializer`, `syncTabs`, `shallow`, `deepWatch`, `onError`, plus the `reset()`/`clear()` controls as the third tuple element.

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

## Why the alias?

Nuxt already ships its own `useState` — a *server-side, payload-shared* state primitive. This module deliberately auto-imports the composable as **`useSmartState`** so the two never collide:

| | Nuxt `useState` | `useSmartState` |
| --- | --- | --- |
| Shared server → client via payload | ✅ | ✅ |
| Persisted across sessions (storage) | ❌ | ✅ |
| Cross-tab sync, TTL, debounced writes | ❌ | ✅ |

Reach for Nuxt's `useState` for purely per-request server state; reach for `useSmartState` when the value also belongs to the browser.

## License

[MIT](./LICENSE) © [Luigi Davide Micca](https://luigimicca.com)
