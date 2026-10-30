import { describe, expect, it } from 'vitest';
import { obbFromCenter, obbOverlap, raycastObb } from '../../src/game/geometry';

describe('OBB 几何', () => {
  it('重叠与分离判定', () => {
    const a = obbFromCenter(0, 0, 2, 4, 0);
    const b = obbFromCenter(1.5, 0, 2, 4, 0);
    const c = obbFromCenter(5, 0, 2, 4, 0);
    expect(obbOverlap(a, b)).toBe(true);
    expect(obbOverlap(a, c)).toBe(false);
  });

  it('旋转矩形仍按朝向判定', () => {
    const a = obbFromCenter(0, 0, 2, 6, 0);
    const rotated = obbFromCenter(0, 2.8, 2, 6, Math.PI / 2);
    expect(obbOverlap(a, rotated)).toBe(true);
  });

  it('射线命中最近面，未命中返回 null', () => {
    const box = obbFromCenter(0, 10, 2, 4, 0);
    const hit = raycastObb({ x: 0, y: 2.4 }, 0, 120, box);
    expect(hit).not.toBeNull();
    expect(hit ?? 0).toBeCloseTo(5.6, 1);

    const miss = raycastObb({ x: 5, y: 0 }, 0, 120, box);
    expect(miss).toBeNull();
  });

  it('射线量程外不命中', () => {
    const box = obbFromCenter(0, 200, 2, 4, 0);
    expect(raycastObb({ x: 0, y: 0 }, 0, 120, box)).toBeNull();
  });
});
