import type { StorageLike } from 'vue-smart-state'

export const isServer = import.meta.server ?? typeof window === 'undefined'

/** Storages the server reads from the request too, so the server render already shows the stored value. */
const serverReadable = new WeakSet<StorageLike>()

export const markServerReadable = <S extends StorageLike>(storage: S): S => {
  serverReadable.add(storage)
  return storage
}

export const isServerReadable = (storage: StorageLike | undefined): boolean =>
  storage !== undefined && serverReadable.has(storage)
