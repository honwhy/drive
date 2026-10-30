import { getLevel } from '../config/levels';
import { getPolicy } from '../config/policies';
import { createRunSeed } from '../core/rng';
import { createStorage } from '../core/storage';
import { DEFAULT_SETTINGS } from '../types/settings';
import { el } from '../ui/dom';
import { openModal } from '../ui/modal';
import { STRINGS } from '../ui/strings';
import { createAudio } from './audio';
import { isIOSDevice, isStandaloneDisplay, requestGameFullscreen } from './fullscreen';
import { createInitialState, navigate, type AppAction } from './navigation';
import { bestOf, createProgress, recordResult } from './progress';
import { loadSave, resetSave, saveBest, saveProgress, saveSettings } from './save';
import { createSettings } from './settings';
import { createBriefingScreen } from './screens/briefing';
import type { ScreenContext, ScreenHandle } from './screens/context';
import { createDrivingScreen } from './screens/driving';
import { createLevelSelectScreen } from './screens/levelSelect';
import { createMenuScreen } from './screens/menu';
import { createPolicyScreen } from './screens/policy';
import { createResultScreen } from './screens/result';

/**
 * 应用装配：全局导航状态机 + 屏幕渲染 + 音效 + 本地存档 + 弹层。
 * 屏幕组件只通过 dispatch 触发迁移，不直接修改状态。
 */
export function createApp(root: HTMLElement): () => void {
  root.replaceChildren();

  const storage = createStorage();
  const saved = loadSave(storage);
  const audio = createAudio();
  audio.setEnabled(saved.settings.sound);

  const settings = createSettings(saved.settings, (value) => {
    audio.setEnabled(value.sound);
    if (!saveSettings(storage, value)) {
      persistent = false;
    }
  });

  let state = createInitialState(saved.lastPolicy);
  let progress = saved.progress;
  let persistent = saved.persistent;
  let runSeed = createRunSeed();
  let current: ScreenHandle | null = null;
  let disposed = false;

  const openHelp = (): void => {
    openModal({
      title: STRINGS.help.title,
      lines: STRINGS.help.body,
      actions: [
        {
          label: STRINGS.help.tutorialButton,
          onClick: () => {
            openModal({
              title: STRINGS.help.tutorialTitle,
              lines: STRINGS.help.tutorialSteps,
            });
          },
        },
        { label: STRINGS.modal.close, primary: true },
      ],
    });
  };

  const resetAll = (): void => {
    settings.set(DEFAULT_SETTINGS);
    resetSave(storage);
    progress = createProgress();
    persistent = storage.persistent;
  };

  const openSettings = (): void => {
    const panel = el('div', 'settings');
    panel.append(
      toggleRow(STRINGS.settings.sound, settings.value.sound, (checked) => {
        settings.set({ sound: checked });
        if (checked) {
          audio.play('click');
        }
      }),
      toggleRow(STRINGS.settings.sensors, settings.value.sensors, (checked) => {
        settings.set({ sensors: checked });
      }),
      toggleRow(STRINGS.settings.haptics, settings.value.haptics, (checked) => {
        settings.set({ haptics: checked });
      }),
      el(
        'p',
        persistent ? 'settings__hint' : 'settings__warning',
        persistent ? STRINGS.settings.storageHint : STRINGS.settings.storageWarning,
      ),
      el('p', 'settings__about', STRINGS.settings.aboutText),
    );

    const resetButton = el('button', 'btn btn--danger btn--wide', STRINGS.settings.reset);
    resetButton.type = 'button';
    resetButton.addEventListener('click', () => {
      openModal({
        title: STRINGS.settings.resetConfirmTitle,
        lines: [
          STRINGS.settings.resetConfirmText,
          persistent ? STRINGS.settings.storageHint : STRINGS.settings.storageWarning,
        ],
        actions: [
          { label: STRINGS.settings.cancel },
          {
            label: STRINGS.settings.resetConfirm,
            primary: true,
            onClick: () => {
              resetAll();
              dispatch({ type: 'home' });
            },
          },
        ],
      });
    });

    const fullscreenButton = el(
      'button',
      'btn btn--wide',
      STRINGS.settings.fullscreen,
    );
    fullscreenButton.type = 'button';
    fullscreenButton.addEventListener('click', () => {
      requestGameFullscreen();
    });
    panel.append(fullscreenButton);
    if (isIOSDevice() && !isStandaloneDisplay()) {
      panel.append(el('p', 'settings__hint', STRINGS.settings.fullscreenHint));
    }
    panel.append(resetButton);

    openModal({
      title: STRINGS.settings.title,
      content: panel,
      actions: [{ label: STRINGS.modal.close, primary: true }],
    });
  };

  const dispatch = (action: AppAction): void => {
    if (disposed) {
      return;
    }
    if (action.type === 'finish') {
      if (state.screen !== 'driving') {
        return;
      }
      const result = action.result;
      const recorded = recordResult(progress, result.levelId, result.report);
      progress = recorded.progress;
      if (!saveProgress(storage, progress, state.policyId)) {
        persistent = false;
      }
      if (!saveBest(storage, progress)) {
        persistent = false;
      }
    }
    if (action.type === 'startDriving' || action.type === 'retry') {
      runSeed = createRunSeed();
    }
    state = navigate(state, action);
    if (action.type === 'setPolicy' || action.type === 'approvePolicy') {
      if (!saveProgress(storage, progress, state.policyId)) {
        persistent = false;
      }
    }
    render();
  };

  const buildScreen = (ctx: ScreenContext): ScreenHandle => {
    switch (state.screen) {
      case 'menu':
        return createMenuScreen(ctx);
      case 'levelSelect':
        return createLevelSelectScreen(ctx);
      case 'policy':
        return createPolicyScreen(ctx);
      case 'briefing':
        return createBriefingScreen(ctx);
      case 'result':
        return createResultScreen(ctx);
      case 'driving': {
        const level = state.levelId === null ? undefined : getLevel(state.levelId);
        if (!level) {
          return createMenuScreen(ctx);
        }
        return createDrivingScreen({
          level,
          policy: getPolicy(state.policyId),
          audio,
          settings,
          seed: runSeed,
          bestBefore: bestOf(progress, level.id),
          onFinish: (result) => dispatch({ type: 'finish', result }),
          onExit: () => {
            audio.play('click');
            dispatch({ type: 'home' });
          },
          onHelp: openHelp,
          onSettings: openSettings,
        });
      }
    }
  };

  const render = (): void => {
    current?.destroy();
    current = null;
    root.replaceChildren();

    const ctx: ScreenContext = {
      state,
      progress,
      audio,
      persistent,
      dispatch,
      openHelp,
      openSettings,
    };

    const screen = buildScreen(ctx);
    current = screen;
    root.append(screen.element);
  };

  render();

  return () => {
    disposed = true;
    current?.destroy();
    current = null;
    root.replaceChildren();
  };
}

function toggleRow(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const row = el('label', 'settings__row');
  const toggle = el('input', 'settings__toggle');
  toggle.type = 'checkbox';
  toggle.checked = checked;
  toggle.addEventListener('change', () => onChange(toggle.checked));
  row.append(el('span', 'settings__label', label), toggle);
  return row;
}
