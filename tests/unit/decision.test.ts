import { describe, expect, it } from 'vitest';
import { createDecisionMachine } from '../../src/game/decision/machine';
import { getPolicy } from '../../src/config/policies';
import type { PerceptionObject, PerceptionSnapshot, TrafficLight } from '../../src/types/game';

interface SnapshotOptions {
  readonly speedMps?: number;
  readonly leadGapM?: number;
  readonly leadSpeedMps?: number;
  readonly objects?: readonly PerceptionObject[];
  readonly rear?: readonly PerceptionObject[];
  readonly light?: TrafficLight;
  readonly stopLineM?: number | null;
  readonly laneIndex?: number;
  readonly lateralM?: number;
}

function object(
  id: string,
  kind: PerceptionObject['kind'],
  forwardM: number,
  lateralM: number,
  speedMps = 0,
): PerceptionObject {
  return {
    id,
    kind,
    forwardM,
    lateralM,
    speedMps,
    lengthM: kind === 'pedestrian' ? 0.6 : 4.6,
    widthM: 1.9,
    risk: 'safe',
  };
}

function snapshot(options: SnapshotOptions = {}): PerceptionSnapshot {
  const speed = options.speedMps ?? 60 / 3.6;
  const leadGap = options.leadGapM;
  const lead =
    leadGap === undefined
      ? null
      : {
          id: 'lead',
          distanceM: leadGap,
          relativeSpeedMps: speed - (options.leadSpeedMps ?? 40 / 3.6),
          ttcS:
            speed - (options.leadSpeedMps ?? 40 / 3.6) > 0.1
              ? leadGap / (speed - (options.leadSpeedMps ?? 40 / 3.6))
              : null,
        };
  return {
    tick: 1,
    ego: {
      speedMps: speed,
      laneIndex: options.laneIndex ?? 1,
      lateralOffsetM: options.lateralM ?? 0,
    },
    lead,
    rays: [],
    objects: options.objects ?? [],
    lane: {
      laneCount: 3,
      widthM: 3.5,
      leftLineM: 5.25,
      rightLineM: 5.25,
      stopLineM: options.stopLineM ?? null,
      onCrosswalk: false,
      speedLimitKmh: 60,
    },
    light: options.light ?? { state: 'none', remainingS: null },
    rear: options.rear ?? [],
    risk: 'safe',
  };
}

describe('决策状态机', () => {
  it('ACC 跟车时目标速度不高于前车', () => {
    const machine = createDecisionMachine(getPolicy('normal'));
    const output = machine.update(
      snapshot({ leadGapM: 20, leadSpeedMps: 30 / 3.6, speedMps: 60 / 3.6 }),
    );
    expect(output.state).toBe('follow');
    expect(output.targetSpeedMps).toBeLessThanOrEqual(30 / 3.6 + 0.01);
    expect(output.emergencyBrake).toBe(false);
  });

  it('TTC ≤ 1.2 s 触发 AEB 全力制动', () => {
    const machine = createDecisionMachine(getPolicy('normal'));
    const output = machine.update(
      snapshot({ leadGapM: 10, leadSpeedMps: 16.7 - 10, speedMps: 16.7 }),
    );
    expect(output.aebActive).toBe(true);
    expect(output.emergencyBrake).toBe(true);
    expect(output.reasonCode).toBe('aeb');
  });

  it('红灯在停止线前减速停车', () => {
    const machine = createDecisionMachine(getPolicy('normal'));
    const output = machine.update(
      snapshot({ stopLineM: 25, light: { state: 'red', remainingS: 4 } }),
    );
    expect(output.state).toBe('stop');
    expect(output.reasonCode).toBe('redLight');
    expect(output.targetSpeedMps).toBeLessThan(16.7);
  });

  it('行人进入本车道时让行', () => {
    const machine = createDecisionMachine(getPolicy('normal'));
    const output = machine.update(snapshot({ objects: [object('ped', 'pedestrian', 20, 0)] }));
    expect(output.state).toBe('yield');
    expect(output.reasonCode).toBe('pedestrian');
  });

  it('慢车持续阻挡且相邻车道安全时发起变道', () => {
    const machine = createDecisionMachine(getPolicy('normal'));
    let output = machine.update(snapshot({ leadGapM: 40, leadSpeedMps: 20 / 3.6 }));
    for (let i = 0; i < 60 && output.state !== 'laneChange'; i += 1) {
      output = machine.update(snapshot({ leadGapM: 40, leadSpeedMps: 20 / 3.6 }));
    }
    expect(output.state).toBe('laneChange');
    expect(output.laneChangeEvent).toBe('started');
    expect(output.reasonCode).toBe('laneChangeLeft');
  });

  it('相邻车道无安全窗口时不变道', () => {
    const machine = createDecisionMachine(getPolicy('normal'));
    const blocked = [
      object('left', 'vehicle', 8, -3.5, 20),
      object('right', 'vehicle', 8, 3.5, 20),
    ];
    let output = machine.update(
      snapshot({ leadGapM: 40, leadSpeedMps: 20 / 3.6, objects: blocked }),
    );
    for (let i = 0; i < 80; i += 1) {
      output = machine.update(snapshot({ leadGapM: 40, leadSpeedMps: 20 / 3.6, objects: blocked }));
    }
    expect(output.state).not.toBe('laneChange');
  });

  it('本车道静止障碍且无变道窗口时请求接管', () => {
    const machine = createDecisionMachine(getPolicy('normal'));
    const objects = [
      object('box', 'obstacle', 35, 0),
      object('left', 'vehicle', 8, -3.5, 20),
      object('right', 'vehicle', 8, 3.5, 20),
    ];
    const output = machine.update(snapshot({ objects, speedMps: 16.7 }));
    expect(output.state).toBe('takeoverRequest');
    expect(output.takeoverReason).toBe('blockedLane');
  });

  it('无风险时保持巡航', () => {
    const machine = createDecisionMachine(getPolicy('conservative'));
    const output = machine.update(snapshot());
    expect(output.state).toBe('cruise');
    expect(output.reasonCode).toBe('keepLane');
    expect(output.targetSpeedMps).toBeCloseTo(60 / 3.6, 5);
  });

  it('策略时距真实影响跟车目标速度', () => {
    const data = snapshot({ leadGapM: 25, leadSpeedMps: 60 / 3.6 });
    const conservative = createDecisionMachine(getPolicy('conservative')).update(data);
    const aggressive = createDecisionMachine(getPolicy('aggressive')).update(data);
    expect(conservative.targetSpeedMps).toBeLessThan(aggressive.targetSpeedMps);
  });
});
