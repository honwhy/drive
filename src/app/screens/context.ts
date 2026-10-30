import type { AudioManager } from '../audio';
import type { AppAction, AppState } from '../navigation';
import type { ProgressState } from '../progress';

export interface ScreenContext {
  readonly state: AppState;
  readonly progress: ProgressState;
  readonly audio: AudioManager;
  readonly persistent: boolean;
  dispatch(action: AppAction): void;
  openHelp(): void;
  openSettings(): void;
}

export interface ScreenHandle {
  readonly element: HTMLElement;
  destroy(): void;
}
