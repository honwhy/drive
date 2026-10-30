import type { HudEvent, HudModel, RiskLevel } from '../types/hud';
import { describeDecision } from './decisionText';
import { createButton, el } from './dom';
import { clamp01, formatDistanceM, formatDurationS, formatEta, formatSpeed } from './format';
import { STRINGS } from './strings';

export type ControlAction = 'left' | 'right' | 'accelerate' | 'brake';

export interface HudHandlers {
  onTogglePause(): void;
  onTakeover(): void;
  onResumeAuto(): void;
  onControl(action: ControlAction, active: boolean): void;
}

export interface Hud {
  readonly element: HTMLElement;
  update(model: HudModel): void;
  setPaused(paused: boolean): void;
  setTutorialHighlight(action: 'accel' | 'brake' | 'steer' | null): void;
  pushEvent(event: HudEvent): void;
  destroy(): void;
}

const MODE_LABEL: Readonly<Record<HudModel['mode'], string>> = {
  auto: STRINGS.driving.modeAuto,
  manual: STRINGS.driving.modeManual,
  takeoverRequest: STRINGS.driving.modeTakeover,
};

const RISK_LABEL: Readonly<Record<RiskLevel, string>> = {
  safe: STRINGS.risk.safe,
  caution: STRINGS.risk.caution,
  warning: STRINGS.risk.warning,
  danger: STRINGS.risk.danger,
};

/** DOM 信息面板：只读模型，不访问世界对象。 */
export function createHud(handlers: HudHandlers): Hud {
  const element = el('section', 'hud');
  element.setAttribute('aria-label', '驾驶信息');

  const top = el('div', 'hud__top');
  const headline = el('div', 'hud__headline');
  const levelName = el('span', 'hud__title', '');
  const policyChip = el('span', 'hud__chip', '');
  headline.append(levelName, policyChip);
  const pauseButton = createButton(STRINGS.driving.pause, handlers.onTogglePause, {
    className: 'btn--hud',
  });
  top.append(headline, pauseButton);

  const metrics = el('div', 'hud__metrics');

  const speedValue = el('strong', 'hud__value', '0');
  const speedBlock = metricBlock(STRINGS.hud.speed);
  const speedRow = el('span', 'hud__value-row');
  speedRow.append(speedValue, el('span', 'hud__unit', STRINGS.driving.speedUnit));
  speedBlock.append(speedRow);

  const leadValue = el('strong', 'hud__value', STRINGS.hud.noLead);
  const leadMeta = el('span', 'hud__sub', `${STRINGS.hud.ttc} —`);
  const leadBlock = metricBlock(STRINGS.hud.lead);
  leadBlock.append(leadValue, leadMeta);

  const riskBadge = el('span', 'risk risk--safe');
  const riskIcon = el('span', 'risk__icon');
  riskIcon.setAttribute('aria-hidden', 'true');
  const riskText = el('span', 'risk__text', RISK_LABEL.safe);
  riskBadge.append(riskIcon, riskText);
  const riskBlock = metricBlock(STRINGS.hud.risk);
  riskBlock.append(riskBadge);

  const modeValue = el('strong', 'hud__mode', MODE_LABEL.auto);
  modeValue.dataset['mode'] = 'auto';
  const modeBlock = metricBlock(STRINGS.hud.mode);
  modeBlock.append(modeValue);

  metrics.append(speedBlock, leadBlock, riskBlock, modeBlock);

  const takeover = el('div', 'takeover');
  const takeoverHead = el('div', 'takeover__head');
  const takeoverCount = el('span', 'takeover__count', '');
  takeoverHead.append(el('strong', 'takeover__title', STRINGS.hud.takeoverTitle), takeoverCount);
  const takeoverReason = el('p', 'takeover__reason', STRINGS.hud.takeoverReason);
  const takeoverButton = createButton(STRINGS.hud.takeoverAction, handlers.onTakeover, {
    primary: true,
    className: 'btn--takeover',
  });
  takeover.append(takeoverHead, takeoverReason, takeoverButton);
  takeover.hidden = true;

  const decision = el('div', 'hud__decision');
  const decisionState = el('span', 'hud__state', '');
  const decisionReason = el('span', 'hud__reason', '');
  decision.append(decisionState, decisionReason);

  const events = el('div', 'hud__events');
  events.setAttribute('role', 'status');
  events.setAttribute('aria-live', 'polite');

  const spacer = el('div', 'hud__spacer');

  const progress = el('div', 'hud__progress');
  const progressTrack = el('div', 'progress');
  const progressFill = el('div', 'progress__fill');
  progressTrack.append(progressFill);
  const progressInfo = el('div', 'hud__progress-info');
  const travelledText = el('span', 'hud__progress-text', '');
  const remainingText = el('span', 'hud__progress-text', '');
  progressInfo.append(travelledText, remainingText);
  progress.append(progressTrack, progressInfo);

  const controls = el('div', 'hud__controls');
  const autoGroup = el('div', 'hud__auto');
  autoGroup.append(
    createButton(STRINGS.hud.takeover, handlers.onTakeover, {
      primary: true,
      className: 'btn--takeover',
    }),
  );

  const manualGroup = el('div', 'hud__manual');
  const resumeButton = createButton(STRINGS.hud.resumeAuto, handlers.onResumeAuto, {
    ghost: true,
    className: 'btn--resume',
  });
  const pad = el('div', 'control-pad');
  const controlButtons = {
    left: holdButton('left', STRINGS.hud.controlLeft, handlers),
    right: holdButton('right', STRINGS.hud.controlRight, handlers),
    accelerate: holdButton('accelerate', STRINGS.hud.controlAccelerate, handlers),
    brake: holdButton('brake', STRINGS.hud.controlBrake, handlers),
  };
  pad.append(
    controlButtons.left,
    controlButtons.right,
    controlButtons.accelerate,
    controlButtons.brake,
  );
  manualGroup.append(resumeButton, pad);
  manualGroup.hidden = true;
  controls.append(autoGroup, manualGroup);

  element.append(top, metrics, takeover, decision, events, spacer, progress, controls);

  const toasts = new Map<HTMLElement, number>();

  const removeToast = (toast: HTMLElement): void => {
    const timer = toasts.get(toast);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      toasts.delete(toast);
    }
    toast.remove();
  };

  return {
    element,
    update(model: HudModel): void {
      levelName.textContent = model.levelName;
      policyChip.textContent = model.policyName;

      speedValue.textContent = formatSpeed(model.speedKmh);
      leadValue.textContent =
        model.leadDistanceM === null ? STRINGS.hud.noLead : formatDistanceM(model.leadDistanceM);
      leadMeta.textContent = `${STRINGS.hud.ttc} ${
        model.leadTtcS === null ? '—' : `${formatDurationS(model.leadTtcS)} s`
      }`;

      riskBadge.className = `risk risk--${model.risk}`;
      riskText.textContent = RISK_LABEL[model.risk];

      modeValue.textContent = MODE_LABEL[model.mode];
      modeValue.dataset['mode'] = model.mode;

      const text = describeDecision(model.decision.state, model.decision.reasonCode);
      decisionState.textContent = text.state;
      decisionReason.textContent = model.decision.detail
        ? `${text.reason} · ${model.decision.detail}`
        : text.reason;

      const total = Math.max(model.progress.totalM, 1);
      const travelled = Math.max(0, Math.min(model.progress.travelledM, total));
      const remaining = Math.max(total - travelled, 0);
      progressFill.style.width = `${(clamp01(travelled / total) * 100).toFixed(1)}%`;
      travelledText.textContent = `${STRINGS.hud.progressText} ${formatDistanceM(
        travelled,
      )} / ${formatDistanceM(total)} m`;
      remainingText.textContent = `${STRINGS.hud.remaining} ${formatDistanceM(
        remaining,
      )} m · ${STRINGS.hud.eta} ${formatEta(remaining, model.speedKmh)}`;

      const requesting = model.mode === 'takeoverRequest' && model.takeoverRemainingS !== null;
      takeover.hidden = !requesting;
      if (requesting) {
        takeoverCount.textContent = `${STRINGS.hud.takeoverCountdown} ${formatDurationS(
          model.takeoverRemainingS ?? 0,
        )} s`;
        if (model.takeoverReason) {
          takeoverReason.textContent = model.takeoverReason;
        }
      }

      const manual = model.mode === 'manual';
      autoGroup.hidden = manual;
      manualGroup.hidden = !manual;
    },
    setPaused(paused: boolean): void {
      pauseButton.textContent = paused ? STRINGS.driving.resume : STRINGS.driving.pause;
    },
    setTutorialHighlight(action: 'accel' | 'brake' | 'steer' | null): void {
      const highlighted = new Set<ControlAction>();
      if (action === 'accel') {
        highlighted.add('accelerate');
      } else if (action === 'brake') {
        highlighted.add('brake');
      } else if (action === 'steer') {
        highlighted.add('left');
        highlighted.add('right');
      }
      for (const [name, button] of Object.entries(controlButtons)) {
        button.classList.toggle('is-hint', highlighted.has(name as ControlAction));
      }
    },
    pushEvent(event: HudEvent): void {
      const toast = el('div', `toast toast--${event.tone ?? 'info'}`, event.text);
      events.append(toast);
      toasts.set(
        toast,
        window.setTimeout(() => {
          removeToast(toast);
        }, 3000),
      );
      while (events.children.length > 2) {
        const first = events.firstElementChild;
        if (!(first instanceof HTMLElement)) {
          break;
        }
        removeToast(first);
      }
    },
    destroy(): void {
      for (const toast of [...toasts.keys()]) {
        removeToast(toast);
      }
    },
  };
}

function metricBlock(label: string): HTMLElement {
  const block = el('div', 'hud__block');
  block.append(el('span', 'hud__label', label));
  return block;
}

function holdButton(
  action: ControlAction,
  label: string,
  handlers: HudHandlers,
): HTMLButtonElement {
  const button = el('button', `control control--${action}`);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  const icons: Readonly<Record<ControlAction, string>> = {
    left: '←',
    right: '→',
    accelerate: '▲',
    brake: '▼',
  };
  const icon = el('span', 'control__icon', icons[action]);
  icon.setAttribute('aria-hidden', 'true');
  const text = el('span', 'control__label', label);
  button.append(icon, text);

  const press = (event: PointerEvent): void => {
    event.preventDefault();
    button.classList.add('is-active');
    try {
      button.setPointerCapture?.(event.pointerId);
    } catch {
      // 合成事件或已释放的指针不支持捕获时忽略
    }
    handlers.onControl(action, true);
  };
  const release = (): void => {
    if (!button.classList.contains('is-active')) {
      return;
    }
    button.classList.remove('is-active');
    handlers.onControl(action, false);
  };

  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);

  return button;
}
