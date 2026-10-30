/** 本地存储适配器：失败时降级为内存，绝不阻断游戏。 */
export interface StorageAdapter {
  read<T>(key: string, parse: (raw: unknown) => T | null): T | null;
  write(key: string, value: unknown): boolean;
  remove(key: string): void;
  readonly persistent: boolean;
}

export function createStorage(backend?: Storage | null): StorageAdapter {
  let storage: Storage | null;
  if (backend !== undefined) {
    storage = backend;
  } else {
    try {
      storage = typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      storage = null;
    }
  }
  const memory = new Map<string, string>();
  let persistent = storage !== null;

  const readRaw = (key: string): string | null => {
    const cached = memory.get(key);
    if (cached !== undefined) {
      return cached;
    }
    if (!storage) {
      return null;
    }
    try {
      return storage.getItem(key);
    } catch {
      persistent = false;
      return null;
    }
  };

  return {
    read<T>(key: string, parse: (raw: unknown) => T | null): T | null {
      const raw = readRaw(key);
      if (raw === null) {
        return null;
      }
      try {
        return parse(JSON.parse(raw) as unknown);
      } catch {
        return null;
      }
    },
    write(key: string, value: unknown): boolean {
      let serialized: string;
      try {
        serialized = JSON.stringify(value);
      } catch {
        return false;
      }
      memory.set(key, serialized);
      if (!storage) {
        return false;
      }
      try {
        storage.setItem(key, serialized);
        return true;
      } catch {
        persistent = false;
        return false;
      }
    },
    remove(key: string): void {
      memory.delete(key);
      if (!storage) {
        return;
      }
      try {
        storage.removeItem(key);
      } catch {
        persistent = false;
      }
    },
    get persistent(): boolean {
      return persistent;
    },
  };
}
