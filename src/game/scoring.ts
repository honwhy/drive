import { SCORING } from '../config/balance';
import type { LevelRules } from '../config/levels';
import { safeGapRatio, type Telemetry } from './telemetry';

export interface ScoreResult {
  readonly safety: number;
  readonly comfort: number;
  readonly decision: number;
  readonly laneChange: number;
  readonly total: number;
  readonly stars: 1 | 2 | 3 | 4 | 5;
  readonly title: string;
  readonly passed: boolean;
  readonly failReason: string | null;
  readonly tips: readonly string[];
}

function clampScore(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function starsFor(total: number, capped: boolean): 1 | 2 | 3 | 4 | 5 {
  if (capped) {
    return 1;
  }
  if (total >= 90) {
    return 5;
  }
  if (total >= 80) {
    return 4;
  }
  if (total >= 70) {
    return 3;
  }
  if (total >= 60) {
    return 2;
  }
  return 1;
}

function titleFor(total: number): string {
  if (total >= 90) {
    return '老司机';
  }
  if (total >= 80) {
    return '稳健型';
  }
  if (total >= 70) {
    return '合格';
  }
  if (total >= 60) {
    return '新手';
  }
  return '危险驾驶';
}

function failChecks(telemetry: Telemetry, rules: LevelRules): string[] {
  const failures: string[] = [];
  if (telemetry.collisions > 0) {
    failures.push(telemetry.collisionReason ?? '发生碰撞');
  }
  if (telemetry.safeStop) {
    failures.push('接管超时，安全停车');
  }
  if (rules.tutorial && (!telemetry.tutorialCompleted || telemetry.tutorialSkipped)) {
    failures.push('未完成三步基础教学');
  }
  if (rules.minSafeGapRatio !== undefined) {
    const ratio = safeGapRatio(telemetry);
    if (ratio === null || ratio < rules.minSafeGapRatio) {
      failures.push('安全跟车时距占比不足');
    }
  }
  if (rules.requireLaneChange && telemetry.laneChangeSuccess < 1) {
    failures.push('本局未完成成功变道');
  }
  if (rules.zeroRedLight && telemetry.redLightViolations > 0) {
    failures.push('闯红灯');
  }
  if (rules.zeroNoYield && telemetry.noYield > 0) {
    failures.push('未礼让行人');
  }
  return failures;
}

function buildTips(
  telemetry: Telemetry,
  failures: readonly string[],
  scores: readonly number[],
): string[] {
  const tips: string[] = [];
  const add = (tip: string): void => {
    if (!tips.includes(tip) && tips.length < 3) {
      tips.push(tip);
    }
  };

  if (telemetry.collisions > 0) {
    add('发生碰撞：保持更大跟车距离，必要时提前接管。');
  }
  if (failures.some((reason) => reason.includes('安全停车'))) {
    add('接管超时：系统请求接管时请立即点击接管或使用手动画控件。');
  }
  if (telemetry.redLightViolations > 0) {
    add('闯红灯：接近路口提前减速，红灯必须在停止线前停车。');
  }
  if (telemetry.noYield > 0) {
    add('未礼让行人：行人在人行横道内时必须停车等待。');
  }
  if (failures.some((reason) => reason.includes('跟车时距'))) {
    add('跟车时距不足：增大跟车距离，或改用保守策略。');
  }
  if (failures.some((reason) => reason.includes('变道'))) {
    add('变道未达成：观察相邻车道前后窗口，确认安全后再变道。');
  }

  const labels = ['安全', '舒适', '决策', '变道'];
  let lowestIndex = 0;
  for (let i = 1; i < scores.length; i += 1) {
    if ((scores[i] ?? 100) < (scores[lowestIndex] ?? 100)) {
      lowestIndex = i;
    }
  }
  const lowest = scores[lowestIndex] ?? 100;
  if (lowest < 80) {
    if (labels[lowestIndex] === '安全') {
      add('安全分偏低：减少急刹、跟车过近与接管次数。');
    } else if (labels[lowestIndex] === '舒适') {
      add('舒适分偏低：提前松油门，避免急加速与急促转向。');
    } else if (labels[lowestIndex] === '决策') {
      add('决策分偏低：遵守信号灯、礼让行人，避免无故停车。');
    } else {
      add('变道分偏低：只在有足够空间时变道，避免中止与不必要的变道。');
    }
  }

  if (tips.length === 0) {
    add('表现稳定，可尝试更高难度关卡或更积极的策略。');
  }
  return tips;
}

/** 纯函数评分：相同遥测与关卡规则必须得到相同结果。 */
export function scoreRun(telemetry: Telemetry, rules: LevelRules): ScoreResult {
  const safety = clampScore(
    100 -
      40 * telemetry.collisions -
      8 * telemetry.takeoverCount -
      5 * telemetry.hardBrakes -
      30 * telemetry.redLightViolations -
      10 * telemetry.illegalLaneChanges -
      10 * telemetry.tailgatingEvents,
  );
  const comfort = clampScore(
    100 -
      6 * telemetry.hardBrakes -
      2 * telemetry.aebCount -
      3 * telemetry.hardAccels -
      2 * telemetry.sharpTurns,
  );
  const decision = clampScore(
    100 -
      30 * telemetry.redLightViolations -
      15 * telemetry.noYield -
      10 * (telemetry.missedGreen + telemetry.stoppedWithoutReason) -
      5 * telemetry.speedingEvents,
  );
  let laneChange = clampScore(
    100 - 25 * telemetry.laneChangeAborts - 10 * telemetry.unnecessaryLaneChanges,
  );
  if (rules.requireLaneChange && telemetry.laneChangeSuccess < 1) {
    laneChange = Math.min(laneChange, 60);
  }

  const weighted =
    SCORING.weights.safety * safety +
    SCORING.weights.comfort * comfort +
    SCORING.weights.decision * decision +
    SCORING.weights.laneChange * laneChange;

  const capped = telemetry.collisions > 0 || telemetry.safeStop;
  const total = capped
    ? Math.min(Math.round(weighted), SCORING.collisionCap)
    : Math.round(weighted);
  const failures = failChecks(telemetry, rules);
  if (total < SCORING.passScore) {
    failures.push('综合评分低于 60');
  }
  const passed = failures.length === 0;
  const tips = buildTips(telemetry, failures, [safety, comfort, decision, laneChange]);

  return {
    safety,
    comfort,
    decision,
    laneChange,
    total,
    stars: starsFor(total, capped),
    title: titleFor(total),
    passed,
    failReason: failures[0] ?? null,
    tips,
  };
}
