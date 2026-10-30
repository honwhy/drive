import { describe, expect, it } from 'vitest';
import { createSimulation } from '../../src/game/simulation';
import { getPolicy } from '../../src/config/policies';
import { scoreRun } from '../../src/game/scoring';
import { generateScenario } from '../../src/game/scenario';

function run(levelId: number, seed: number, seconds: number) {
  const sim = createSimulation({ levelId, policy: getPolicy('normal'), seed });
  const steps = Math.round(seconds / (1 / 60));
  for (let i = 0; i < steps && !sim.finished; i += 1) {
    sim.step(1 / 60);
  }
  return sim;
}

describe('模拟集成', () => {
  it('第 2 关自动行驶可到达终点且零碰撞', () => {
    const sim = run(2, 1001, 60);
    expect(sim.finished).toBe(true);
    expect(sim.finishReason).toBe('arrived');
    expect(sim.telemetry.collisions).toBe(0);
    const report = scoreRun(sim.telemetry, {});
    expect(report.passed).toBe(true);
  });

  it('第 3 关自动跟车不碰撞并累计跟车时间', () => {
    const sim = run(3, 2002, 90);
    expect(sim.telemetry.collisions).toBe(0);
    expect(sim.telemetry.distanceM).toBeGreaterThan(100);
    expect(sim.telemetry.followTimeS).toBeGreaterThan(0);
    const report = scoreRun(sim.telemetry, { minSafeGapRatio: 0.8 });
    expect(report.passed).toBe(true);
  });

  it('第 5 关自动寻找安全窗口完成变道', () => {
    const sim = run(5, 5005, 90);
    expect(sim.telemetry.laneChangeSuccess).toBeGreaterThanOrEqual(1);
    expect(sim.telemetry.collisions).toBe(0);
    expect(scoreRun(sim.telemetry, { requireLaneChange: true }).passed).toBe(true);
  });

  it('第 4 关前车急刹时 AEB/ACC 保持零碰撞', () => {
    const sim = run(4, 4004, 120);
    expect(sim.telemetry.collisions).toBe(0);
    expect(sim.finished).toBe(true);
  });

  it('第 6 关路口与行人场景零碰撞、零闯红灯、零未让行', () => {
    const sim = run(6, 6006, 180);
    expect(sim.telemetry.collisions).toBe(0);
    expect(sim.telemetry.redLightViolations).toBe(0);
    expect(sim.telemetry.noYield).toBe(0);
    expect(sim.finished).toBe(true);
    expect(scoreRun(sim.telemetry, { zeroRedLight: true, zeroNoYield: true }).passed).toBe(true);
  });

  it('第 7 关路口停车不越过停止线', () => {
    const frontGaps: number[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const sim = createSimulation({ levelId: 7, policy: getPolicy('normal'), seed });
      let wasMoving = false;
      for (let i = 0; i < 60 * 240 && !sim.finished; i += 1) {
        sim.step(1 / 60);
        const snap = sim.snapshot();
        const signal = snap.scenario.signals.find((item) => Math.abs(item.s - snap.ego.s) < 50);
        if (signal && snap.ego.speedMps < 0.05 && wasMoving) {
          frontGaps.push(signal.s - snap.ego.s - 2.4);
          wasMoving = false;
        }
        if (snap.ego.speedMps > 1) {
          wasMoving = true;
        }
      }
    }
    expect(frontGaps.length).toBeGreaterThan(0);
    for (const gap of frontGaps) {
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(4);
    }
  });

  it('第 7 关随机场景在多个种子下零碰撞', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const sim = run(7, seed, 240);
      expect(sim.telemetry.collisions).toBe(0);
      expect(sim.finished).toBe(true);
      expect(sim.finishReason).toBe('arrived');
      const report7 = scoreRun(sim.telemetry, { zeroRedLight: true, zeroNoYield: true });
      expect(report7.passed).toBe(true);
    }
  });

  it('无安全变道窗口时请求接管，超时安全停车', () => {
    const base = generateScenario(2, 77);
    const scenario = {
      ...base,
      statics: [
        ...base.statics,
        {
          id: 'blocking-work',
          kind: 'construction' as const,
          lane: 0,
          s: 120,
          lateralM: null,
          lengthM: 1.2,
          widthM: 2.2,
        },
      ],
      vehicles: [
        ...base.vehicles,
        ...Array.from({ length: 12 }, (_, index) => 10 + index * 12).map((s, index) => ({
          id: `blocking-car-${index}`,
          lane: 1,
          s,
          speedMps: 0,
          targetSpeedMps: 0,
          lengthM: 4.6,
          widthM: 1.9,
          body: 'sedan' as const,
          speedChanges: [],
          brakeAtS: [],
          cutInAtS: null,
          cutInLane: null,
          crossingDir: 0 as const,
          crossSpeedMps: 0,
          lateralM: null,
        })),
      ],
    };
    const sim = createSimulation({
      levelId: 2,
      policy: getPolicy('normal'),
      seed: 77,
      scenario,
    });
    let requested = false;
    for (let i = 0; i < 600 && !sim.finished; i += 1) {
      sim.step(1 / 60);
      if (sim.snapshot().mode === 'takeoverRequest') {
        requested = true;
        break;
      }
    }
    expect(requested).toBe(true);
    expect(sim.snapshot().takeoverRemainingS).not.toBeNull();
    for (let i = 0; i < 600 && !sim.finished; i += 1) {
      sim.step(1 / 60);
    }
    expect(sim.finished).toBe(true);
    expect(sim.finishReason).toBe('safeStop');
    expect(sim.telemetry.safeStop).toBe(true);
  });

  it('手动驶出道路立即判定碰撞', () => {
    const sim = createSimulation({ levelId: 1, policy: getPolicy('normal'), seed: 1 });
    sim.setControl('accelerate', true);
    for (let i = 0; i < 180; i += 1) sim.step(1 / 60);
    sim.setControl('right', true);
    for (let i = 0; i < 420 && !sim.finished; i += 1) sim.step(1 / 60);
    expect(sim.finished).toBe(true);
    expect(sim.finishReason).toBe('collision');
    expect(sim.telemetry.collisionReason).toBe('驶出道路');
  });

  it('主动接管与交还记录统计', () => {
    const sim = createSimulation({ levelId: 2, policy: getPolicy('normal'), seed: 2 });
    for (let i = 0; i < 120; i += 1) sim.step(1 / 60);
    sim.setManual(true);
    expect(sim.snapshot().mode).toBe('manual');
    for (let i = 0; i < 120; i += 1) sim.step(1 / 60);
    const result = sim.requestResumeAuto();
    expect(result.ok).toBe(true);
    expect(sim.snapshot().mode).toBe('auto');
    expect(sim.telemetry.takeoverCount).toBe(1);
    expect(sim.telemetry.takeoverDurationS).toBeGreaterThan(1);
    expect(sim.telemetry.takeoverEvents).toHaveLength(1);
    expect(sim.telemetry.takeoverEvents[0]?.requestedBySystem).toBe(false);
    expect(sim.telemetry.takeoverEvents[0]?.endedAtS).not.toBeNull();
  });

  it('相同种子与输入得到完全一致的轨迹', () => {
    const a = createSimulation({ levelId: 7, policy: getPolicy('aggressive'), seed: 777 });
    const b = createSimulation({ levelId: 7, policy: getPolicy('aggressive'), seed: 777 });
    for (let i = 0; i < 900; i += 1) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    expect(a.snapshot().ego.s).toBe(b.snapshot().ego.s);
    expect(a.snapshot().ego.lateralM).toBe(b.snapshot().ego.lateralM);
    expect(a.telemetry.hardBrakes).toBe(b.telemetry.hardBrakes);
  });
});
