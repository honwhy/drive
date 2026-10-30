import { describe, expect, it } from 'vitest';
import { generateScenario } from '../../src/game/scenario';

describe('场景生成', () => {
  it('相同种子生成完全一致的场景', () => {
    expect(generateScenario(7, 123456)).toEqual(generateScenario(7, 123456));
  });

  it('第 7 关至少 5 个事件、覆盖 4 类，且间隔足够', () => {
    const scenario = generateScenario(7, 98765);
    expect(scenario.events.length).toBeGreaterThanOrEqual(5);
    const types = new Set(scenario.events.map((event) => event.type));
    expect(types.size).toBeGreaterThanOrEqual(4);
    const positions = scenario.events.map((event) => event.s).sort((a, b) => a - b);
    for (let i = 1; i < positions.length; i += 1) {
      expect((positions[i] ?? 0) - (positions[i - 1] ?? 0)).toBeGreaterThanOrEqual(100);
    }
  });

  it('第 2 关障碍位于相邻车道或路侧，本车道保持通行', () => {
    const scenario = generateScenario(2, 1);
    expect(scenario.statics).toHaveLength(3);
    for (const obstacle of scenario.statics) {
      expect(obstacle.lane).not.toBe(0);
    }
  });

  it('第 5 关提供慢车与安全变道窗口', () => {
    const scenario = generateScenario(5, 44);
    const slow = scenario.vehicles.find((vehicle) => vehicle.id === 'slow-lead');
    expect(slow?.speedMps).toBeLessThan(15);
    const adjacent = scenario.vehicles
      .filter((vehicle) => vehicle.lane === 1)
      .map((vehicle) => vehicle.s)
      .sort((a, b) => a - b);
    expect(adjacent.length).toBeGreaterThan(0);
    const gaps = adjacent.slice(1).map((s, index) => s - (adjacent[index] ?? 0));
    expect(Math.max(...gaps)).toBeGreaterThan(100);
  });

  it('所有实体在开局即存在，不依赖运行时随机', () => {
    const scenario = generateScenario(7, 5);
    const allS = [...scenario.vehicles.map((v) => v.s), ...scenario.statics.map((s) => s.s)];
    expect(allS.every((s) => Number.isFinite(s))).toBe(true);
  });
});
