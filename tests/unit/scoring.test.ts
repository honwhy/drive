import { describe, expect, it } from 'vitest';
import { scoreRun } from '../../src/game/scoring';
import { createTelemetry, type Telemetry } from '../../src/game/telemetry';

function telemetry(overrides: Partial<Telemetry> = {}): Telemetry {
  return { ...createTelemetry(), distanceM: 800, durationS: 60, ...overrides };
}

describe('评分', () => {
  it('无违规时四项满分、总分 100、5 星', () => {
    const report = scoreRun(telemetry(), {});
    expect(report).toMatchObject({
      safety: 100,
      comfort: 100,
      decision: 100,
      laneChange: 100,
      total: 100,
      stars: 5,
      passed: true,
      failReason: null,
    });
    expect(report.title).toBe('老司机');
  });

  it('子分按规则计算并截断到 0', () => {
    const report = scoreRun(
      telemetry({
        hardBrakes: 2,
        takeoverCount: 1,
        tailgatingEvents: 1,
        redLightViolations: 1,
        illegalLaneChanges: 1,
        aebCount: 1,
        hardAccels: 2,
        sharpTurns: 1,
      }),
      {},
    );
    expect(report.safety).toBe(100 - 10 - 8 - 10 - 30 - 10);
    expect(report.comfort).toBe(100 - 12 - 2 - 6 - 2);
    expect(report.decision).toBe(70);
  });

  it('碰撞封顶 50 分、1 星、未通过', () => {
    const report = scoreRun(telemetry({ collisions: 1, collisionReason: '追尾碰撞' }), {});
    expect(report.total).toBeLessThanOrEqual(50);
    expect(report.stars).toBe(1);
    expect(report.passed).toBe(false);
    expect(report.failReason).toBe('追尾碰撞');
  });

  it('安全停车同样封顶并给出建议', () => {
    const report = scoreRun(telemetry({ safeStop: true }), {});
    expect(report.passed).toBe(false);
    expect(report.total).toBeLessThanOrEqual(50);
    expect(report.tips.length).toBeGreaterThanOrEqual(1);
    expect(report.tips.length).toBeLessThanOrEqual(3);
  });

  it('关卡要求变道但零成功时变道分不超过 60', () => {
    const report = scoreRun(telemetry(), { requireLaneChange: true });
    expect(report.laneChange).toBeLessThanOrEqual(60);
    expect(report.passed).toBe(false);
    expect(report.failReason).toContain('变道');
  });

  it('跟车时距占比不足时未通过', () => {
    const report = scoreRun(telemetry({ followTimeS: 60, safeGapTimeS: 30 }), {
      minSafeGapRatio: 0.8,
    });
    expect(report.passed).toBe(false);
  });

  it('同一遥测重复计算 10 次结果一致', () => {
    const data = telemetry({ hardBrakes: 1, takeoverCount: 1, laneChangeAborts: 1 });
    const first = scoreRun(data, {});
    for (let i = 0; i < 10; i += 1) {
      expect(scoreRun(data, {})).toEqual(first);
    }
  });

  it('第 1 关未完成或跳过教学时未通过', () => {
    const skipped = scoreRun(telemetry({ tutorialSkipped: true }), { tutorial: true });
    expect(skipped.passed).toBe(false);
    expect(skipped.failReason).toContain('教学');
    const completed = scoreRun(telemetry({ tutorialCompleted: true }), { tutorial: true });
    expect(completed.passed).toBe(true);
  });
});
