import { describe, expect, it, vi } from 'vitest';
import { createSettings } from '../../src/app/settings';

describe('会话设置', () => {
  it('默认开启声音与传感器', () => {
    const settings = createSettings();
    expect(settings.value).toEqual({ sound: true, sensors: true, haptics: false });
  });

  it('修改设置时通知订阅者并保持不可变引用', () => {
    const settings = createSettings();
    const listener = vi.fn();
    const unsubscribe = settings.subscribe(listener);
    const before = settings.value;

    settings.set({ sensors: false });
    expect(listener).toHaveBeenCalledWith({ sound: true, sensors: false, haptics: false });
    expect(settings.value).not.toBe(before);
    expect(before.sensors).toBe(true);

    unsubscribe();
    settings.set({ sound: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('局部修改不影响其他字段', () => {
    const settings = createSettings({ sound: false, sensors: true, haptics: true });
    settings.set({ sensors: false });
    expect(settings.value).toEqual({ sound: false, sensors: false, haptics: true });
  });
});
