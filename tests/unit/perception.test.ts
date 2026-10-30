import { describe, expect, it } from 'vitest';
import {
  sense,
  riskFromDistance,
  riskFromTtc,
  type PerceptionWorld,
} from '../../src/game/perception';
import type { EgoState, EntityState } from '../../src/types/game';
import { createEgoState, laneCenter } from '../../src/game/vehicle';

function ego(speed = 10): EgoState {
  return { ...createEgoState(speed, 0, 2, 3.5) };
}

function entity(
  id: string,
  kind: EntityState['kind'],
  lane: number,
  s: number,
  speed = 0,
  lateral?: number,
): EntityState {
  return {
    id,
    kind,
    lane,
    s,
    lateralM: lateral ?? laneCenter(lane, 2, 3.5),
    speedMps: speed,
    lengthM: kind === 'pedestrian' ? 0.6 : 4.6,
    widthM: kind === 'pedestrian' ? 0.5 : 1.9,
    body: 'sedan',
    crossingDir: 0,
  };
}

function world(entities: readonly EntityState[], egoState = ego()): PerceptionWorld {
  return {
    ego: egoState,
    egoWidthM: 1.9,
    egoLengthM: 4.8,
    entities,
    laneCount: 2,
    laneWidthM: 3.5,
    speedLimitKmh: 60,
    signals: [],
    crosswalks: [],
  };
}

describe('虚拟感知', () => {
  it('无目标时 5 条射线返回 120 m', () => {
    const snapshot = sense(world([]), 1);
    expect(snapshot.rays).toHaveLength(5);
    for (const ray of snapshot.rays) {
      expect(ray.distanceM).toBe(120);
    }
  });

  it('前车只取本车道最近车辆', () => {
    const snapshot = sense(
      world([entity('lead', 'vehicle', 0, 30, 8), entity('adjacent', 'vehicle', 1, 20, 8)]),
      1,
    );
    const lead = snapshot.lead;
    expect(lead).not.toBeNull();
    if (!lead) {
      return;
    }
    expect(lead.id).toBe('lead');
    expect(lead.distanceM).toBeCloseTo(30 - 4.6 / 2 - 4.8 / 2, 5);
    expect(lead.ttcS).toBeCloseTo(lead.distanceM / 2, 5);
  });

  it('中心射线命中前方障碍，误差 ≤ 0.5 m', () => {
    const snapshot = sense(world([entity('box', 'obstacle', 0, 50)]), 1);
    const center = snapshot.rays.find((ray) => ray.angleDeg === 0);
    expect(center).toBeDefined();
    // 原点在本车前保险杠：50 - 4.6/2 - 4.8/2 = 45.3
    expect(center?.distanceM ?? 0).toBeCloseTo(45.3, 1);
  });

  it('近处目标遮挡远端，远端不进入快照', () => {
    const near = { ...entity('near', 'obstacle', 0, 16), lengthM: 1 };
    const far = entity('far', 'vehicle', 0, 45);
    const snapshot = sense(world([near, far]), 1);
    expect(snapshot.objects.some((object) => object.id === 'near')).toBe(true);
    expect(snapshot.objects.some((object) => object.id === 'far')).toBe(false);
  });

  it('风险阈值按 SEN-06 分段', () => {
    expect(riskFromTtc(4.1)).toBe('safe');
    expect(riskFromTtc(4)).toBe('caution');
    expect(riskFromTtc(2)).toBe('warning');
    expect(riskFromTtc(1.5)).toBe('warning');
    expect(riskFromTtc(1)).toBe('danger');
    expect(riskFromTtc(0.9)).toBe('danger');

    expect(riskFromDistance(30.1)).toBe('safe');
    expect(riskFromDistance(30)).toBe('caution');
    expect(riskFromDistance(15)).toBe('warning');
    expect(riskFromDistance(8)).toBe('danger');
    expect(riskFromDistance(7.9)).toBe('danger');
  });

  it('后向探测识别相邻车道 200 m 内目标', () => {
    const snapshot = sense(world([entity('rear', 'vehicle', 1, -50, 14)]), 1);
    expect(snapshot.rear).toHaveLength(1);
    expect(snapshot.rear[0]?.forwardM).toBeCloseTo(-50, 5);
    expect(snapshot.rear[0]?.speedMps).toBe(14);
  });

  it('速度低于 1 m/s 时不计算时距', () => {
    const slowEgo = ego(0.5);
    const snapshot = sense(world([entity('lead', 'vehicle', 0, 20)], slowEgo), 1);
    expect(snapshot.lead?.ttcS).toBeNull();
  });
});
