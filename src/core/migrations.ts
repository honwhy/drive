import { DEFAULT_POLICY, type PolicyId } from '../config/policies';
import type { AppSettings } from '../types/settings';
import type { LevelBest } from '../app/progress';

const POLICY_IDS: readonly PolicyId[] = ['conservative', 'normal', 'aggressive'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPolicy(value: unknown): value is PolicyId {
  return typeof value === 'string' && POLICY_IDS.includes(value as PolicyId);
}

export interface ProgressSave {
  readonly unlockedLevel: number;
  readonly lastPolicy: PolicyId;
}

export function parseProgress(raw: unknown, maxLevel: number): ProgressSave | null {
  if (!isRecord(raw) || raw['version'] !== 1) {
    return null;
  }
  const unlocked = raw['unlockedLevel'];
  const policy = raw['lastPolicy'];
  if (typeof unlocked !== 'number' || !Number.isFinite(unlocked)) {
    return null;
  }
  return {
    unlockedLevel: Math.min(Math.max(Math.round(unlocked), 1), maxLevel),
    lastPolicy: isPolicy(policy) ? policy : DEFAULT_POLICY,
  };
}

export function parseBest(raw: unknown, maxLevel: number): Record<number, LevelBest> | null {
  if (!isRecord(raw) || raw['version'] !== 1 || !isRecord(raw['best'])) {
    return null;
  }
  const best: Record<number, LevelBest> = {};
  for (let level = 1; level <= maxLevel; level += 1) {
    const entry = raw['best'][String(level)];
    if (!isRecord(entry)) {
      continue;
    }
    const score = entry['score'];
    const stars = entry['stars'];
    if (
      typeof score === 'number' &&
      Number.isFinite(score) &&
      score >= 0 &&
      score <= 100 &&
      typeof stars === 'number' &&
      Number.isInteger(stars) &&
      stars >= 1 &&
      stars <= 5
    ) {
      best[level] = { score: Math.round(score), stars };
    }
  }
  return best;
}

export function parseSettings(raw: unknown): AppSettings | null {
  if (!isRecord(raw) || raw['version'] !== 1) {
    return null;
  }
  const sound = raw['sound'];
  const sensors = raw['sensors'];
  const haptics = raw['haptics'];
  if (typeof sound !== 'boolean' || typeof sensors !== 'boolean') {
    return null;
  }
  return {
    sound,
    sensors,
    haptics: typeof haptics === 'boolean' ? haptics : false,
  };
}
