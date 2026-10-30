import { DEFAULT_SETTINGS, type AppSettings } from '../types/settings';

export type { AppSettings } from '../types/settings';

/**
 * 本次会话内的设置；变更通过回调写入本地存档。
 * 订阅者用于让 Canvas 图层与音效即时响应开关。
 */
export interface SettingsStore {
  readonly value: AppSettings;
  set(patch: Partial<AppSettings>): void;
  subscribe(listener: (value: AppSettings) => void): () => void;
}

export function createSettings(
  initial: AppSettings = DEFAULT_SETTINGS,
  onChange?: (value: AppSettings) => void,
): SettingsStore {
  let value = initial;
  const listeners = new Set<(value: AppSettings) => void>();

  return {
    get value(): AppSettings {
      return value;
    },
    set(patch: Partial<AppSettings>): void {
      value = { ...value, ...patch };
      for (const listener of listeners) {
        listener(value);
      }
      onChange?.(value);
    },
    subscribe(listener: (value: AppSettings) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
