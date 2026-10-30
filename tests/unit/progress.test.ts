import { describe, expect, it } from 'vitest';
import {
  bestOf,
  completeLevel,
  createProgress,
  isLevelUnlocked,
  recordResult,
} from '../../src/app/progress';
import type { ScoreResult } from '../../src/game/scoring';

function report(total: number, passed = true): ScoreResult {
  return {
    safety: total,
    comfort: total,
    decision: total,
    laneChange: total,
    total,
    stars: 5,
    title: '老司机',
    passed,
    failReason: passed ? null : '未通过',
    tips: [],
  };
}

describe('关卡进度', () => {
  it('默认只解锁第 1 关', () => {
    const progress = createProgress();
    expect(progress.unlockedLevel).toBe(1);
    expect(isLevelUnlocked(progress, 1)).toBe(true);
    expect(isLevelUnlocked(progress, 2)).toBe(false);
  });

  it('通过一关解锁下一关且不修改原对象', () => {
    const progress = createProgress();
    const next = completeLevel(progress, 1);
    expect(next.unlockedLevel).toBe(2);
    expect(progress.unlockedLevel).toBe(1);
    expect(isLevelUnlocked(next, 2)).toBe(true);
  });

  it('重复通关不会回退解锁进度', () => {
    const progress = completeLevel(createProgress(), 3);
    const replay = completeLevel(progress, 1);
    expect(replay.unlockedLevel).toBe(progress.unlockedLevel);
  });

  it('解锁上限为最后一关', () => {
    const progress = completeLevel(createProgress(), 7);
    expect(progress.unlockedLevel).toBe(7);
  });

  it('通过后解锁并记录最佳，同分/低分不覆盖', () => {
    const first = recordResult(createProgress(), 1, report(85));
    expect(first.progress.unlockedLevel).toBe(2);
    expect(bestOf(first.progress, 1)).toEqual({ score: 85, stars: 5 });

    const lower = recordResult(first.progress, 1, report(80));
    expect(bestOf(lower.progress, 1)?.score).toBe(85);
    expect(lower.isNewBest).toBe(false);

    const higher = recordResult(first.progress, 1, report(92));
    expect(bestOf(higher.progress, 1)?.score).toBe(92);
    expect(higher.isNewBest).toBe(true);
  });

  it('未通过不解锁也不写最佳', () => {
    const failed = recordResult(createProgress(), 2, report(40, false));
    expect(failed.progress.unlockedLevel).toBe(1);
    expect(bestOf(failed.progress, 2)).toBeNull();
    expect(failed.isNewBest).toBe(false);
  });
});
