import type { StandardSchemaV1, StorageLike } from 'vue-smart-state'

export const stringSchema: StandardSchemaV1<unknown, string> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) =>
      typeof value === 'string' ? { value } : { issues: [{ message: 'expected a string' }] }
  }
}

export const memoryStorage = (entries: Record<string, string> = {}): StorageLike & {
  data: Map<string, string>
} => {
  const data = new Map(Object.entries(entries))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    }
  }
}
