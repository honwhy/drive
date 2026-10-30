/** 可注入种子的确定性伪随机数生成器（mulberry32）。 */
export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

let seedCounter = 0;

/** 应用层生成随机种子；模拟内部仍只接受注入种子，不使用 Math.random。 */
export function createRunSeed(): number {
  seedCounter = (seedCounter + 1) >>> 0;
  try {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const value = values[0];
    if (value !== undefined) {
      return value >>> 0;
    }
  } catch {
    // 非安全上下文时回退到递增种子
  }
  return (Date.now() ^ (seedCounter * 2654435761)) >>> 0;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range(min: number, max: number): number {
      return min + (max - min) * next();
    },
    int(min: number, max: number): number {
      return Math.floor(min + (max - min) * next());
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error('无法从空数组取值');
      }
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) {
        throw new Error('随机取值越界');
      }
      return item;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const a = copy[i];
        const b = copy[j];
        if (a !== undefined && b !== undefined) {
          copy[i] = b;
          copy[j] = a;
        }
      }
      return copy;
    },
  };
}
