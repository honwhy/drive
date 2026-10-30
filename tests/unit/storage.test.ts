import { describe, expect, it } from 'vitest';
import { createStorage } from '../../src/core/storage';
import { parseBest, parseProgress, parseSettings } from '../../src/core/migrations';
import { loadSave, resetSave, saveBest, saveProgress, saveSettings } from '../../src/app/save';
import { createProgress } from '../../src/app/progress';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  failWrites = false;
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error('quota');
    }
    this.data.set(key, value);
  }
}

describe('本地存储', () => {
  it('正常写入与读取', () => {
    const backend = new MemoryStorage();
    const storage = createStorage(backend);
    expect(storage.write('k', { a: 1 })).toBe(true);
    expect(
      storage.read('k', (raw) => (typeof raw === 'object' ? (raw as { a: number }) : null)),
    ).toEqual({
      a: 1,
    });
    expect(storage.persistent).toBe(true);
  });

  it('损坏 JSON 返回 null', () => {
    const backend = new MemoryStorage();
    backend.setItem('bad', '{not-json');
    const storage = createStorage(backend);
    expect(storage.read('bad', () => ({}))).toBeNull();
  });

  it('写入失败降级为内存态并提示', () => {
    const backend = new MemoryStorage();
    const storage = createStorage(backend);
    backend.failWrites = true;
    expect(storage.write('k', { a: 2 })).toBe(false);
    expect(storage.persistent).toBe(false);
    expect(storage.read('k', (raw) => raw as { a: number })).toEqual({ a: 2 });
  });

  it('无 localStorage 时仍可读取内存数据', () => {
    const storage = createStorage(null);
    expect(storage.persistent).toBe(false);
    expect(storage.write('k', 1)).toBe(false);
    expect(storage.read('k', (raw) => raw as number)).toBe(1);
  });
});

describe('存档校验与迁移', () => {
  it('版本不匹配回退 null', () => {
    expect(parseProgress({ version: 2, unlockedLevel: 3 }, 7)).toBeNull();
    expect(parseBest({ version: 0, best: {} }, 7)).toBeNull();
    expect(parseSettings({ version: 2, sound: true, sensors: true })).toBeNull();
  });

  it('非法字段被丢弃', () => {
    expect(parseProgress({ version: 1, unlockedLevel: 99, lastPolicy: 'bad' }, 7)).toEqual({
      unlockedLevel: 7,
      lastPolicy: 'normal',
    });
    expect(
      parseBest(
        { version: 1, best: { '1': { score: 300, stars: 9 }, '2': { score: 80, stars: 4 } } },
        7,
      ),
    ).toEqual({ 2: { score: 80, stars: 4 } });
  });

  it('读写进度、最佳与设置后能恢复', () => {
    const backend = new MemoryStorage();
    const storage = createStorage(backend);
    const progress = { unlockedLevel: 3, best: { 2: { score: 88, stars: 4 } } };
    expect(saveProgress(storage, progress, 'aggressive')).toBe(true);
    expect(saveBest(storage, progress)).toBe(true);
    expect(saveSettings(storage, { sound: false, sensors: false, haptics: true })).toBe(true);

    const loaded = loadSave(storage);
    expect(loaded.progress).toEqual(progress);
    expect(loaded.lastPolicy).toBe('aggressive');
    expect(loaded.settings).toEqual({ sound: false, sensors: false, haptics: true });
    expect(loaded.persistent).toBe(true);
  });

  it('重置清空全部键', () => {
    const backend = new MemoryStorage();
    const storage = createStorage(backend);
    saveProgress(storage, createProgress(), 'normal');
    saveBest(storage, createProgress());
    saveSettings(storage, { sound: true, sensors: true, haptics: false });
    resetSave(storage);
    const loaded = loadSave(storage);
    expect(loaded.progress.unlockedLevel).toBe(1);
    expect(loaded.progress.best).toEqual({});
    expect(loaded.settings).toEqual({ sound: true, sensors: true, haptics: false });
  });
});
