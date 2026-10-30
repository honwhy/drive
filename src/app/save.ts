import { MAX_LEVEL } from '../config/levels';
import { DEFAULT_POLICY, type PolicyId } from '../config/policies';
import { createStorage, type StorageAdapter } from '../core/storage';
import { parseBest, parseProgress, parseSettings } from '../core/migrations';
import { DEFAULT_SETTINGS, type AppSettings } from '../types/settings';
import { createProgress, type ProgressState } from './progress';

export const SAVE_KEYS = {
  progress: 'ads.v1.progress',
  best: 'ads.v1.best',
  settings: 'ads.v1.settings',
} as const;

export interface SaveLoadResult {
  readonly progress: ProgressState;
  readonly settings: AppSettings;
  readonly lastPolicy: PolicyId;
  readonly persistent: boolean;
}

export function loadSave(storage: StorageAdapter = createStorage()): SaveLoadResult {
  const progressSave = storage.read(SAVE_KEYS.progress, (raw) => parseProgress(raw, MAX_LEVEL));
  const best = storage.read(SAVE_KEYS.best, (raw) => parseBest(raw, MAX_LEVEL)) ?? {};
  const settings = storage.read(SAVE_KEYS.settings, parseSettings) ?? DEFAULT_SETTINGS;
  const fallback = createProgress();
  return {
    progress: progressSave
      ? { unlockedLevel: progressSave.unlockedLevel, best }
      : { ...fallback, best },
    settings,
    lastPolicy: progressSave?.lastPolicy ?? DEFAULT_POLICY,
    persistent: storage.persistent,
  };
}

export function saveProgress(
  storage: StorageAdapter,
  progress: ProgressState,
  lastPolicy: PolicyId,
): boolean {
  return storage.write(SAVE_KEYS.progress, {
    version: 1,
    unlockedLevel: progress.unlockedLevel,
    lastPolicy,
  });
}

export function saveBest(storage: StorageAdapter, progress: ProgressState): boolean {
  return storage.write(SAVE_KEYS.best, { version: 1, best: progress.best });
}

export function saveSettings(storage: StorageAdapter, settings: AppSettings): boolean {
  return storage.write(SAVE_KEYS.settings, { version: 1, ...settings });
}

export function resetSave(storage: StorageAdapter): void {
  storage.remove(SAVE_KEYS.progress);
  storage.remove(SAVE_KEYS.best);
  storage.remove(SAVE_KEYS.settings);
}
