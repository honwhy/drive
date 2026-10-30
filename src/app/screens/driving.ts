import { SIMULATION } from '../../config/balance';
import type { LevelConfig } from '../../config/levels';
import type { PolicyConfig } from '../../config/policies';
import { createFixedLoop } from '../../game/loop';
import { createSimulation, type SimControl, type SimEvent } from '../../game/simulation';
import { scoreRun } from '../../game/scoring';
import { createRenderer, type Renderer } from '../../render/canvas';
import { createButton, el } from '../../ui/dom';
import { reasonLabel } from '../../ui/decisionText';
import { createHud } from '../../ui/hud';
import { STRINGS } from '../../ui/strings';
import { createTutorial } from '../../ui/tutorial';
import type { AudioManager } from '../audio';
import type { RunResult } from '../navigation';
import type { BestSnapshot } from '../navigation';
import type { SettingsStore } from '../settings';
import type { ScreenHandle } from './context';
import type { PerceptionSnapshot } from '../../types/game';

export interface DrivingOptions {
  readonly level: LevelConfig;
  readonly policy: PolicyConfig;
  readonly audio: AudioManager;
  readonly settings: SettingsStore;
  readonly seed: number;
  readonly bestBefore: BestSnapshot | null;
  readonly onFinish: (result: RunResult) => void;
  readonly onExit: () => void;
  readonly onHelp: () => void;
  readonly onSettings: () => void;
}

/**
 * 驾驶屏幕：倒计时 → 固定步长模拟（感知/决策/控制/物理/碰撞/指标）→ 结算。
 * HUD 只读模拟快照；手动画控件写入模拟输入。
 */
export function createDrivingScreen(options: DrivingOptions): ScreenHandle {
  const { level, policy, audio } = options;
  const simulation = createSimulation({
    levelId: level.id,
    policy,
    seed: options.seed,
  });

  const element = el('main', 'screen screen--driving');
  const stage = el('div', 'stage');
  const canvas = el('canvas', 'world');
  canvas.setAttribute('aria-hidden', 'true');
  stage.append(canvas);
  element.append(stage);

  const loop = createFixedLoop({
    stepSeconds: SIMULATION.stepSeconds,
    maxStepsPerFrame: SIMULATION.maxCatchUpSteps,
    maxFrameSeconds: SIMULATION.maxFrameSeconds,
  });

  let renderer: Renderer | null = null;
  let rafId = 0;
  let lastTimestamp = 0;
  let hudAccumulator = 0;
  let paused = false;
  let finished = false;
  let countdownTimer = 0;
  let countdownTimeout = 0;
  let brakeHeld = false;
  let steerHeld = false;

  const haptic = (pattern: number | readonly number[]): void => {
    if (!options.settings.value.haptics) {
      return;
    }
    try {
      navigator.vibrate?.(pattern as number | number[]);
    } catch {
      // 不支持震动时忽略
    }
  };

  const tutorial = level.manual
    ? createTutorial(
        () => {
          simulation.setTutorialResult(false, true);
          hud.pushEvent({ text: STRINGS.tutorial.skippedHint, tone: 'warning' });
          hud.setTutorialHighlight(null);
        },
        () => audio.play('click'),
      )
    : null;

  const hud = createHud({
    onTogglePause: () => togglePause(),
    onTakeover: () => enterManual(),
    onResumeAuto: () => resumeAuto(),
    onControl: (action, active) => {
      handleControl(action, active);
    },
  });
  element.append(hud.element);
  if (tutorial) {
    element.append(tutorial.element);
  }

  renderer = createRenderer(canvas, stage, {
    sensors: options.settings.value.sensors,
    onResize: () => renderer?.draw(simulation.snapshot()),
  });

  const unsubscribeSettings = options.settings.subscribe((value) => {
    renderer?.setSensors(value.sensors);
    renderer?.draw(simulation.snapshot());
  });

  const handleControl = (action: SimControl, active: boolean): void => {
    simulation.setControl(action, active);
    if (action === 'brake') {
      brakeHeld = active;
    }
    if (action === 'left' || action === 'right') {
      steerHeld = active;
    }
  };

  const enterManual = (): void => {
    if (simulation.finished || simulation.snapshot().mode === 'manual') {
      return;
    }
    simulation.setManual(true);
    brakeHeld = false;
    steerHeld = false;
    audio.play('takeover', 0.7);
    haptic(60);
    hud.pushEvent({ text: STRINGS.hud.eventTakeover, tone: 'warning' });
    updateHud();
  };

  const resumeAuto = (): void => {
    const result = simulation.requestResumeAuto();
    if (result.ok) {
      audio.play('click');
      hud.pushEvent({ text: STRINGS.hud.eventResumeAuto, tone: 'info' });
    } else {
      audio.play('warning', 0.5);
      hud.pushEvent({
        text: `${STRINGS.hud.eventResumeRefused}：${reasonLabel(result.reason ?? 'unknown')}`,
        tone: 'warning',
      });
    }
    updateHud();
  };

  const countdown = el('div', 'countdown');
  const countdownValue = el('strong', 'countdown__value', '3');
  const countdownHint = el('span', 'countdown__hint', '准备开始');
  countdown.append(countdownValue, countdownHint);
  element.append(countdown);

  const pauseOverlay = el('div', 'pause');
  const pausePanel = el('div', 'pause__panel');
  pausePanel.append(el('h2', 'pause__title', STRINGS.driving.paused));
  pausePanel.append(el('p', 'pause__hint', STRINGS.driving.resumeHint));

  const pauseActions = el('div', 'pause__actions');
  pauseActions.append(
    createButton(STRINGS.driving.resume, () => togglePause(), { primary: true }),
    createButton(STRINGS.driving.restart, () => restart()),
    createButton(STRINGS.driving.help, () => options.onHelp()),
    createButton(STRINGS.driving.settings, () => options.onSettings()),
    createButton(STRINGS.driving.exit, () => options.onExit(), { ghost: true }),
  );
  pausePanel.append(pauseActions);
  pauseOverlay.append(pausePanel);
  pauseOverlay.hidden = true;
  element.append(pauseOverlay);

  const updateHud = (): void => {
    const snapshot = simulation.snapshot();
    const perception = snapshot.perception;
    const manual = snapshot.mode === 'manual';
    const mode = snapshot.mode;
    const decision =
      manual || !snapshot.decision
        ? {
            state: manual ? ('manual' as const) : ('cruise' as const),
            reasonCode: manual ? 'manualControl' : 'keepLane',
            detail: null,
          }
        : {
            state: snapshot.decision.state,
            reasonCode: snapshot.decision.reasonCode,
            detail: decisionDetail(snapshot.decision.reasonCode, perception),
          };

    hud.update({
      levelName: `${level.id} · ${level.name}`,
      policyName: level.manual ? '手动教学' : policy.name,
      speedKmh: snapshot.ego.speedMps * 3.6,
      leadDistanceM: perception?.lead?.distanceM ?? null,
      leadTtcS: perception?.lead?.ttcS ?? null,
      risk: perception?.risk ?? 'safe',
      mode,
      decision,
      progress: { travelledM: snapshot.ego.s, totalM: level.lengthM },
      takeoverRemainingS: snapshot.takeoverRemainingS,
      takeoverReason: snapshot.takeoverReason ? reasonLabel(snapshot.takeoverReason) : null,
    });

    if (tutorial) {
      hud.setTutorialHighlight(tutorial.highlight);
    }
  };

  const handleSimEvent = (event: SimEvent): void => {
    switch (event.type) {
      case 'aeb':
        audio.play('aeb', 0.8);
        haptic(80);
        hud.pushEvent({ text: STRINGS.hud.eventAeb, tone: 'danger' });
        break;
      case 'collision':
        audio.play('collision', 0.8);
        haptic([80, 40, 120]);
        hud.pushEvent({
          text: `${STRINGS.hud.eventCollision}：${event.reason ?? ''}`,
          tone: 'danger',
        });
        break;
      case 'laneChangeStart':
        audio.play('turnSignal', 0.4);
        hud.pushEvent({ text: STRINGS.hud.eventLaneChange, tone: 'info' });
        break;
      case 'laneChangeComplete':
        hud.pushEvent({ text: STRINGS.hud.eventLaneComplete, tone: 'info' });
        break;
      case 'laneChangeAbort':
        audio.play('warning', 0.4);
        hud.pushEvent({ text: STRINGS.hud.eventLaneAbort, tone: 'warning' });
        break;
      case 'takeoverRequest':
        audio.play('takeover', 0.8);
        haptic([100, 60, 100]);
        hud.pushEvent({
          text: `${STRINGS.hud.takeoverTitle}：${reasonLabel(event.reason ?? 'unavoidableCollision')}`,
          tone: 'danger',
        });
        break;
      case 'takeoverTimeout':
        hud.pushEvent({ text: STRINGS.hud.eventTakeoverTimeout, tone: 'danger' });
        break;
      case 'redLight':
        audio.play('warning', 0.7);
        hud.pushEvent({ text: STRINGS.hud.eventRedLight, tone: 'danger' });
        break;
      case 'noYield':
        hud.pushEvent({ text: STRINGS.hud.eventNoYield, tone: 'danger' });
        break;
      case 'speeding':
        hud.pushEvent({ text: STRINGS.hud.eventSpeeding, tone: 'warning' });
        break;
      case 'tailgating':
        hud.pushEvent({ text: STRINGS.hud.eventTailgating, tone: 'warning' });
        break;
      case 'laneDeparture':
        hud.pushEvent({ text: STRINGS.hud.eventLaneDeparture, tone: 'warning' });
        break;
      case 'resumeRefused':
        break;
    }
  };

  const finish = (): void => {
    if (finished) {
      return;
    }
    finished = true;
    cancelAnimationFrame(rafId);
    rafId = 0;
    window.clearInterval(countdownTimer);
    window.clearTimeout(countdownTimeout);

    const snapshot = simulation.snapshot();
    if (tutorial) {
      simulation.setTutorialResult(tutorial.completed, tutorial.skipped);
    }
    const telemetry = simulation.telemetry;
    const report = scoreRun(telemetry, level.rules);
    const reason = snapshot.finishReason ?? 'arrived';
    if (reason === 'collision') {
      audio.play('collision', 0.8);
    } else if (reason === 'safeStop') {
      audio.play('warning', 0.7);
    } else {
      audio.play('report', 0.5);
    }

    options.onFinish({
      levelId: level.id,
      passed: report.passed,
      reason,
      distanceM: telemetry.distanceM,
      durationS: telemetry.durationS,
      report,
      telemetry,
      policyId: policy.id,
      seed: options.seed,
      bestBefore: options.bestBefore,
      tutorialSkipped: tutorial?.skipped ?? false,
    });
  };

  const tick = (timestamp: number): void => {
    if (paused || finished) {
      return;
    }
    const delta = lastTimestamp === 0 ? 0 : (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    const steps = loop.advance(delta);
    for (let i = 0; i < steps; i += 1) {
      simulation.step(SIMULATION.stepSeconds);
      if (simulation.finished) {
        break;
      }
    }

    for (const event of simulation.drainEvents()) {
      handleSimEvent(event);
    }

    if (tutorial && !tutorial.completed && !tutorial.skipped) {
      const snapshot = simulation.snapshot();
      tutorial.update({
        speedKmh: snapshot.ego.speedMps * 3.6,
        brakeHeld,
        steerHeld,
        dt: steps * SIMULATION.stepSeconds,
      });
    }

    renderer?.draw(simulation.snapshot());

    hudAccumulator += delta;
    if (hudAccumulator >= 1 / SIMULATION.hudHz) {
      hudAccumulator = 0;
      updateHud();
    }

    if (simulation.finished) {
      finish();
      return;
    }

    rafId = requestAnimationFrame(tick);
  };

  const start = (): void => {
    if (finished) {
      return;
    }
    paused = false;
    pauseOverlay.hidden = true;
    hud.setPaused(false);
    lastTimestamp = 0;
    loop.reset();
    rafId = requestAnimationFrame(tick);
  };

  const runCountdown = (seconds: number): void => {
    window.clearInterval(countdownTimer);
    window.clearTimeout(countdownTimeout);
    countdown.hidden = false;
    let remaining = seconds;
    countdownValue.textContent = String(remaining);
    countdownHint.textContent = '准备开始';
    if (seconds > 1) {
      audio.play('countdown', 0.5);
    }

    countdownTimer = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        countdownValue.textContent = String(remaining);
        return;
      }
      window.clearInterval(countdownTimer);
      countdownValue.textContent = STRINGS.driving.countdownGo;
      countdownHint.textContent = '';
      countdownTimeout = window.setTimeout(() => {
        if (finished) {
          return;
        }
        countdown.hidden = true;
        countdownHint.textContent = '准备开始';
        if (tutorial) {
          tutorial.show();
          hud.setTutorialHighlight(tutorial.highlight);
        }
        start();
      }, 400);
    }, 1000);
  };

  const setPaused = (next: boolean): void => {
    if (finished || paused === next) {
      return;
    }
    paused = next;
    hud.setPaused(paused);
    pauseOverlay.hidden = !paused;
    updateHud();
    if (paused) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      lastTimestamp = 0;
      window.clearInterval(countdownTimer);
      window.clearTimeout(countdownTimeout);
      countdown.hidden = true;
      return;
    }
    runCountdown(1);
  };

  const togglePause = (): void => {
    audio.play('click');
    setPaused(!paused);
  };

  const restart = (): void => {
    finished = false;
    paused = false;
    window.clearInterval(countdownTimer);
    window.clearTimeout(countdownTimeout);
    cancelAnimationFrame(rafId);
    rafId = 0;
    simulation.reset();
    loop.reset();
    lastTimestamp = 0;
    hudAccumulator = 0;
    brakeHeld = false;
    steerHeld = false;
    tutorial?.reset();
    hud.setPaused(false);
    hud.setTutorialHighlight(null);
    pauseOverlay.hidden = true;
    updateHud();
    renderer?.draw(simulation.snapshot());
    runCountdown(3);
  };

  const handleVisibility = (): void => {
    if (document.hidden && !paused) {
      setPaused(true);
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  const orientation = window.matchMedia('(orientation: landscape)');
  const handleOrientation = (event: MediaQueryListEvent): void => {
    if (event.matches && !paused) {
      setPaused(true);
    }
  };
  orientation.addEventListener('change', handleOrientation);

  const handleKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || finished) {
      return;
    }
    if (document.querySelector('.modal')) {
      return;
    }
    setPaused(!paused);
  };
  document.addEventListener('keydown', handleKey);

  updateHud();
  renderer.draw(simulation.snapshot());
  runCountdown(3);

  return {
    element,
    destroy(): void {
      finished = true;
      cancelAnimationFrame(rafId);
      window.clearInterval(countdownTimer);
      window.clearTimeout(countdownTimeout);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('keydown', handleKey);
      orientation.removeEventListener('change', handleOrientation);
      unsubscribeSettings();
      tutorial?.destroy();
      hud.destroy();
      renderer?.destroy();
    },
  };
}

function decisionDetail(reasonCode: string, perception: PerceptionSnapshot | null): string | null {
  if (!perception) {
    return null;
  }
  if (
    reasonCode === 'redLight' ||
    reasonCode === 'redLightAhead' ||
    reasonCode === 'yellowLight' ||
    reasonCode === 'yellowLightAhead'
  ) {
    if (perception.lane.stopLineM !== null) {
      return `距离 ${Math.max(0, perception.lane.stopLineM - 2.4).toFixed(0)} m`;
    }
    return null;
  }
  if (reasonCode === 'pedestrian' || reasonCode === 'pedestrianAhead') {
    const pedestrian = perception.objects.find((object) => object.kind === 'pedestrian');
    return pedestrian ? `距离 ${Math.max(0, pedestrian.forwardM).toFixed(0)} m` : null;
  }
  return null;
}
