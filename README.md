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

SSR is handled for you: on the server the composable skips storage entirely and starts from the initial value; on the client it hydrates from storage.

## Why the alias?

Nuxt already ships its own `useState` — a *server-side, payload-shared* state primitive. This module deliberately auto-imports the composable as **`useSmartState`** so the two never collide:

| | Nuxt `useState` | `useSmartState` |
| --- | --- | --- |
| Shared server → client via payload | ✅ | ❌ |
| Persisted across sessions (storage) | ❌ | ✅ |
| Cross-tab sync, TTL, debounced writes | ❌ | ✅ |

They complement each other: reach for Nuxt's `useState` for per-request server state, and for `useSmartState` when the value belongs to the browser.

## License

[MIT](./LICENSE) © [Luigi Davide Micca](https://luigimicca.com)
