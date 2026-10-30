import { MAX_LEVEL } from '../config/levels';
import type { ScoreResult } from '../game/scoring';

export interface LevelBest {
  readonly score: number;
  readonly stars: number;
}

export interface ProgressState {
  readonly unlockedLevel: number;
  readonly best: Readonly<Record<number, LevelBest>>;
}

export function createProgress(): ProgressState {
  return { unlockedLevel: 1, best: {} };
}

export function isLevelUnlocked(progress: ProgressState, levelId: number): boolean {
  return levelId <= progress.unlockedLevel;
}

export function completeLevel(progress: ProgressState, levelId: number): ProgressState {
  const unlockedLevel = Math.min(Math.max(progress.unlockedLevel, levelId + 1), MAX_LEVEL);
  return { ...progress, unlockedLevel };
}

export function bestOf(progress: ProgressState, levelId: number): LevelBest | null {
  return progress.best[levelId] ?? null;
}

/**
 * 结算记录：通过才解锁与更新最佳；同分保留先达成记录。
 * 返回新对象，屏幕组件不得直接修改进度。
 */
export function recordResult(
  progress: ProgressState,
  levelId: number,
  report: ScoreResult,
): { progress: ProgressState; isNewBest: boolean } {
  if (!report.passed) {
    return { progress, isNewBest: false };
  }
  const unlockedLevel = Math.min(Math.max(progress.unlockedLevel, levelId + 1), MAX_LEVEL);
  const previous = progress.best[levelId];
  const isNewBest = !previous || report.total > previous.score;
  const best = isNewBest
    ? { ...progress.best, [levelId]: { score: report.total, stars: report.stars } }
    : progress.best;
  return { progress: { unlockedLevel, best }, isNewBest };
}

export function progressFromSave(
  unlockedLevel: number,
  best: Readonly<Record<number, LevelBest>>,
): ProgressState {
  return { unlockedLevel, best };
}
