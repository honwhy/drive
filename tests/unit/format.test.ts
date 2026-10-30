import { describe, expect, it } from 'vitest';
import {
  clamp01,
  formatDistanceM,
  formatDurationS,
  formatEta,
  formatSpeed,
} from '../../src/ui/format';

describe('显示格式', () => {
  it('速度取整数 km/h', () => {
    expect(formatSpeed(0)).toBe('0');
    expect(formatSpeed(39.6)).toBe('40');
    expect(formatSpeed(-1)).toBe('0');
  });

  it('距离保留 1 位小数', () => {
    expect(formatDistanceM(12.34)).toBe('12.3');
    expect(formatDistanceM(-3)).toBe('0.0');
  });

  it('时间保留 1 位小数，非法值降级', () => {
    expect(formatDurationS(2.25)).toBe('2.3');
    expect(formatDurationS(Number.NaN)).toBe('—');
    expect(formatDurationS(-1)).toBe('—');
  });

  it('预计剩余时间按当前速度计算', () => {
    // 100 m ÷ (36 km/h = 10 m/s) = 10 s
    expect(formatEta(100, 36)).toBe('10.0 s');
    expect(formatEta(100, 0)).toBe('—');
    expect(formatEta(0, 36)).toBe('0.0 s');
  });

  it('进度比例限制在 0～1', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
  });
});
