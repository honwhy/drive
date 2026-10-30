import { MAX_LEVEL, getLevel } from '../../config/levels';
import { getPolicy } from '../../config/policies';
import { averageSpeedKmh } from '../../game/telemetry';
import { reasonLabel } from '../../ui/decisionText';
import { createButton, el } from '../../ui/dom';
import { STRINGS } from '../../ui/strings';
import type { FinishReason } from '../navigation';
import type { ScreenContext, ScreenHandle } from './context';

const REASON_TEXT: Readonly<Record<FinishReason, string>> = {
  arrived: STRINGS.result.arrived,
  collision: '发生碰撞',
  safeStop: '安全停车',
  quit: '主动退出',
};

/** 结算页：结果、指标、四维子分、星级、最佳对比、建议与后续操作。 */
export function createResultScreen(ctx: ScreenContext): ScreenHandle {
  const element = el('main', 'screen screen--result');
  const result = ctx.state.result;
  const level = ctx.state.levelId === null ? undefined : getLevel(ctx.state.levelId);

  if (!result || !level) {
    element.append(el('p', 'screen__hint', STRINGS.result.reportEmpty));
    return { element, destroy: () => undefined };
  }

  const report = result.report;
  const telemetry = result.telemetry;
  const policy = getPolicy(result.policyId);
  const passed = report.passed;

  const scroll = el('div', 'result__scroll');

  const head = el('header', 'result__head');
  head.append(
    el(
      'p',
      'result__eyebrow',
      `${level.id} · ${level.name} · ${level.manual ? '手动教学' : policy.name}`,
    ),
    el(
      'h1',
      `result__status ${passed ? 'is-passed' : 'is-failed'}`,
      passed ? STRINGS.result.passed : STRINGS.result.failed,
    ),
    el(
      'p',
      'result__reason',
      passed ? REASON_TEXT[result.reason] : (report.failReason ?? REASON_TEXT[result.reason]),
    ),
  );

  const score = el('section', 'result__score');
  const total = el('div', 'result__total');
  total.append(
    el('span', 'result__total-value', String(report.total)),
    el('span', 'result__total-unit', STRINGS.result.total),
  );
  const starRow = el('div', 'result__stars');
  for (let i = 0; i < 5; i += 1) {
    const star = el('span', `star ${i < report.stars ? 'star--on' : ''}`);
    star.setAttribute('aria-label', `${i + 1} 星`);
    starRow.append(star);
  }
  const titleWrap = el('div', 'result__title-wrap');
  titleWrap.append(starRow, el('strong', 'result__title', report.title));
  score.append(total, titleWrap);

  const subScores = el('section', 'result__subscores');
  subScores.append(
    subScore(STRINGS.result.safety, report.safety, 'safety'),
    subScore(STRINGS.result.comfort, report.comfort, 'comfort'),
    subScore(STRINGS.result.decision, report.decision, 'decision'),
    subScore(STRINGS.result.laneChangeScore, report.laneChange, 'lane-change'),
  );

  const metrics = el('section', 'result__metrics');
  metrics.append(
    resultMetric(STRINGS.result.distance, `${(telemetry.distanceM / 1000).toFixed(2)} km`),
    resultMetric(STRINGS.result.avgSpeed, `${averageSpeedKmh(telemetry).toFixed(0)} km/h`),
    resultMetric(STRINGS.result.maxSpeed, `${telemetry.maxSpeedKmh.toFixed(0)} km/h`),
    resultMetric(STRINGS.result.duration, `${telemetry.durationS.toFixed(1)} s`),
    resultMetric(STRINGS.result.takeover, `${telemetry.takeoverCount} ${STRINGS.result.countUnit}`),
    resultMetric(STRINGS.result.takeoverDuration, `${telemetry.takeoverDurationS.toFixed(1)} s`),
    resultMetric(
      STRINGS.result.systemRequest,
      `${telemetry.systemTakeoverCount} ${STRINGS.result.countUnit}`,
    ),
    resultMetric(STRINGS.result.collision, `${telemetry.collisions} ${STRINGS.result.countUnit}`),
    resultMetric(STRINGS.result.hardBrake, `${telemetry.hardBrakes} ${STRINGS.result.countUnit}`),
    resultMetric(STRINGS.result.aeb, `${telemetry.aebCount} ${STRINGS.result.countUnit}`),
    resultMetric(
      STRINGS.result.redLight,
      `${telemetry.redLightViolations} ${STRINGS.result.countUnit}`,
    ),
    resultMetric(
      STRINGS.result.laneChange,
      `${telemetry.laneChangeSuccess}/${telemetry.laneChangeAttempts}`,
    ),
  );

  const takeovers = el('section', 'result__takeovers');
  takeovers.append(el('h2', 'result__takeovers-title', STRINGS.result.takeoverList));
  if (telemetry.takeoverEvents.length === 0) {
    takeovers.append(el('p', 'result__takeover-line', STRINGS.result.takeoverNone));
  } else {
    for (const record of telemetry.takeoverEvents) {
      const end = record.endedAtS ?? telemetry.durationS;
      const duration = Math.max(0, end - record.startedAtS);
      takeovers.append(
        el(
          'p',
          'result__takeover-line',
          `#${record.id} · ${duration.toFixed(1)} s · ${
            record.requestedBySystem ? STRINGS.result.takeoverSystem : STRINGS.result.takeoverActive
          } · ${reasonLabel(record.reasonCode)}`,
        ),
      );
    }
  }

  const best = el('section', 'result__best');
  if (result.bestBefore) {
    best.append(
      el(
        'p',
        'result__best-line',
        `${STRINGS.result.best}：${result.bestBefore.score} 分 · ★ ${result.bestBefore.stars}`,
      ),
    );
  } else {
    best.append(el('p', 'result__best-line', STRINGS.result.noBest));
  }
  if (passed && (!result.bestBefore || report.total > result.bestBefore.score)) {
    best.append(el('p', 'result__best-new', STRINGS.result.newBest));
  }

  const tips = el('section', 'result__tips');
  tips.append(el('h2', 'result__tips-title', STRINGS.result.tips));
  const tipList = el('ul', 'result__tips-list');
  for (const tip of report.tips.slice(0, 3)) {
    tipList.append(el('li', 'result__tip', tip));
  }
  tips.append(tipList);

  const seed = el('p', 'result__seed', `${STRINGS.result.seed} ${result.seed}`);

  scroll.append(head, score, subScores, metrics, takeovers, best, tips, seed);
  element.append(scroll);

  const actions = el('footer', 'result__actions');
  const nextButton = createButton(
    STRINGS.result.next,
    () => {
      ctx.audio.play('click');
      ctx.dispatch({ type: 'nextLevel', maxLevel: MAX_LEVEL });
    },
    { primary: true },
  );
  const hasNext = passed && level.id < MAX_LEVEL;
  nextButton.disabled = !hasNext;
  if (!hasNext) {
    nextButton.title = level.id >= MAX_LEVEL ? STRINGS.result.nextMax : STRINGS.result.nextLocked;
  }

  actions.append(
    createButton(
      STRINGS.result.replay,
      () => {
        ctx.audio.play('click');
        ctx.dispatch({ type: 'retry' });
      },
      { className: 'btn--wide' },
    ),
    nextButton,
    createButton(
      STRINGS.result.home,
      () => {
        ctx.audio.play('click');
        ctx.dispatch({ type: 'home' });
      },
      { ghost: true, className: 'btn--wide' },
    ),
  );
  element.append(actions);

  return { element, destroy: () => undefined };
}

function subScore(label: string, value: number, key: string): HTMLElement {
  const block = el('div', `result__subscore result__subscore--${key}`);
  const bar = el('div', 'result__bar');
  const fill = el('div', 'result__bar-fill');
  fill.style.width = `${Math.min(Math.max(value, 0), 100)}%`;
  bar.append(fill);
  block.append(
    el('span', 'result__label', label),
    el('strong', 'result__subscore-value', String(value)),
    bar,
  );
  return block;
}

function resultMetric(label: string, value: string): HTMLElement {
  const block = el('div', 'result__metric');
  block.append(el('span', 'result__label', label), el('strong', 'result__value', value));
  return block;
}
