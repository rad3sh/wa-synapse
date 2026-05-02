import type { GroupStateStore } from '../types/index.js';

/** In-memory key-value store for a single (groupId, pluginName) pair */
export class InMemoryGroupStateStore implements GroupStateStore {
  private readonly data = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.data.set(key, value);
  }

  delete(key: string): void {
    this.data.delete(key);
  }

  getAll(): Record<string, unknown> {
    return Object.fromEntries(this.data.entries());
  }
}

/** Manages one store per (groupId, pluginName) combination */
export class StateStoreManager {
  private readonly stores = new Map<string, InMemoryGroupStateStore>();

  getStore(groupId: string, pluginName: string): InMemoryGroupStateStore {
    const key = `${groupId}::${pluginName}`;
    if (!this.stores.has(key)) {
      this.stores.set(key, new InMemoryGroupStateStore());
    }
    return this.stores.get(key)!;
  }
}
