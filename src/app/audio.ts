/** 极简音效播放器：素材缺失或播放失败时静默降级。 */
export type SfxName =
  'click' | 'countdown' | 'takeover' | 'aeb' | 'collision' | 'turnSignal' | 'report' | 'warning';

const SOURCES: Readonly<Record<SfxName, string>> = {
  click: '/media/audio/sfx-ui-click.m4a',
  countdown: '/media/audio/sfx-countdown.m4a',
  takeover: '/media/audio/sfx-takeover-alert.m4a',
  aeb: '/media/audio/sfx-aeb.m4a',
  collision: '/media/audio/sfx-collision.m4a',
  turnSignal: '/media/audio/sfx-turn-signal.m4a',
  report: '/media/audio/sfx-report.m4a',
  warning: '/media/audio/sfx-warning.m4a',
};

export interface AudioManager {
  play(name: SfxName, volume?: number): void;
  setEnabled(enabled: boolean): void;
  readonly enabled: boolean;
  stop(name: SfxName): void;
}

export function createAudio(): AudioManager {
  const cache = new Map<SfxName, HTMLAudioElement>();
  let enabled = true;

  const elementFor = (name: SfxName): HTMLAudioElement => {
    const cached = cache.get(name);
    if (cached) {
      return cached;
    }
    const audio = new Audio(SOURCES[name]);
    audio.preload = 'auto';
    cache.set(name, audio);
    return audio;
  };

  return {
    play(name: SfxName, volume = 0.6): void {
      if (!enabled) {
        return;
      }
      try {
        const audio = elementFor(name);
        audio.volume = Math.min(Math.max(volume, 0), 1);
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
      } catch {
        // 素材缺失或浏览器拒绝播放时静默降级，不影响玩法。
      }
    },
    setEnabled(value: boolean): void {
      enabled = value;
      if (!value) {
        for (const audio of cache.values()) {
          audio.pause();
        }
      }
    },
    get enabled(): boolean {
      return enabled;
    },
    stop(name: SfxName): void {
      const audio = cache.get(name);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    },
  };
}
