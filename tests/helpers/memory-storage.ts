import type { ObjectStorage } from "../../src/server/storage/storage.ts";

export function memoryStorage() {
  const objects = new Map<string, Buffer>();
  const storage: ObjectStorage = {
    async put(key, bytes) {
      objects.set(key, bytes);
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
    async exists(key) {
      return objects.has(key);
    },
  };
  return { storage, objects };
}
