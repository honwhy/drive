import { TUTORIAL } from '../config/balance';
import { createButton, el } from './dom';
import { STRINGS } from './strings';

export interface TutorialInput {
  readonly speedKmh: number;
  readonly brakeHeld: boolean;
  readonly steerHeld: boolean;
  readonly dt: number;
}

export interface Tutorial {
  readonly element: HTMLElement;
  readonly completed: boolean;
  readonly skipped: boolean;
  readonly highlight: 'accel' | 'brake' | 'steer' | null;
  update(input: TutorialInput): void;
  show(): void;
  hide(): void;
  reset(): void;
  destroy(): void;
}

const STEP_TEXTS = [
  STRINGS.tutorial.accel,
  STRINGS.tutorial.brake,
  STRINGS.tutorial.steer,
] as const;
const STEP_HINTS = ['accel', 'brake', 'steer'] as const;

/** 第 1 关三步教学：一次只显示一条，可跳过；跳过不记为通过。 */
export function createTutorial(onSkip: () => void, onStepComplete: () => void): Tutorial {
  const element = el('section', 'tutorial');
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');

  const head = el('div', 'tutorial__head');
  const label = el('span', 'tutorial__label', STRINGS.tutorial.title);
  const progress = el('span', 'tutorial__progress', '');
  head.append(label, progress);

  const text = el('p', 'tutorial__text', STEP_TEXTS[0]);
  const hint = el('p', 'tutorial__hint', STRINGS.tutorial.controlHint);
  const skipButton = createButton(STRINGS.tutorial.skip, () => skip(), {
    ghost: true,
    className: 'btn--tutorial-skip',
  });

  element.append(head, text, hint, skipButton);
  element.hidden = true;

  let step = 0;
  let steerHoldS = 0;
  let completed = false;
  let skipped = false;

  const render = (): void => {
    progress.textContent = completed ? '' : `${STRINGS.tutorial.step} ${step + 1} / 3`;
    text.textContent = completed ? STRINGS.tutorial.done : (STEP_TEXTS[step] ?? '');
    skipButton.hidden = completed;
    element.classList.toggle('is-done', completed);
  };

  const skip = (): void => {
    if (completed || skipped) {
      return;
    }
    skipped = true;
    element.hidden = true;
    onSkip();
  };

  const reset = (): void => {
    step = 0;
    steerHoldS = 0;
    completed = false;
    skipped = false;
    element.hidden = true;
    element.classList.remove('is-done');
    render();
  };

  render();

  return {
    element,
    get completed(): boolean {
      return completed;
    },
    get skipped(): boolean {
      return skipped;
    },
    get highlight(): 'accel' | 'brake' | 'steer' | null {
      if (completed || skipped) {
        return null;
      }
      return STEP_HINTS[step] ?? null;
    },
    update(input: TutorialInput): void {
      if (completed || skipped) {
        return;
      }
      if (step === 0) {
        if (input.speedKmh >= TUTORIAL.accelTargetKmh) {
          step = 1;
          steerHoldS = 0;
          onStepComplete();
          render();
        }
        return;
      }
      if (step === 1) {
        if (input.brakeHeld && input.speedKmh <= TUTORIAL.brakeTargetKmh) {
          step = 2;
          steerHoldS = 0;
          onStepComplete();
          render();
        }
        return;
      }
      if (input.steerHeld) {
        steerHoldS += input.dt;
        if (steerHoldS >= TUTORIAL.steerHoldS) {
          completed = true;
          onStepComplete();
          render();
          window.setTimeout(() => {
            if (completed) {
              element.hidden = true;
            }
          }, 1500);
        }
      } else {
        steerHoldS = 0;
      }
    },
    show(): void {
      if (completed || skipped) {
        return;
      }
      element.hidden = false;
      render();
    },
    hide(): void {
      element.hidden = true;
    },
    reset,
    destroy(): void {
      element.remove();
    },
  };
}
