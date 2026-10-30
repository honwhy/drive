import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  navigate,
  type AppAction,
  type AppState,
  type RunResult,
} from '../../src/app/navigation';
import { createTelemetry } from '../../src/game/telemetry';
import type { ScoreResult } from '../../src/game/scoring';

const report = (passed: boolean): ScoreResult => ({
  safety: passed ? 100 : 40,
  comfort: 90,
  decision: 90,
  laneChange: 100,
  total: passed ? 92 : 45,
  stars: passed ? 5 : 1,
  title: passed ? '老司机' : '危险驾驶',
  passed,
  failReason: passed ? null : '发生碰撞',
  tips: ['保持车距'],
});

const result = (passed: boolean): RunResult => ({
  levelId: 1,
  passed,
  reason: passed ? 'arrived' : 'collision',
  distanceM: 500,
  durationS: 40,
  report: report(passed),
  telemetry: createTelemetry(),
  policyId: 'normal',
  seed: 1,
  bestBefore: null,
  tutorialSkipped: false,
});

function apply(state: AppState, ...actions: AppAction[]): AppState {
  return actions.reduce(navigate, state);
}

describe('导航状态机', () => {
  it('初始位于主菜单', () => {
    const state = createInitialState();
    expect(state.screen).toBe('menu');
    expect(state.levelId).toBeNull();
    expect(state.result).toBeNull();
  });

  it('第 1 关跳过策略选择，直接进入关卡说明', () => {
    const state = apply(createInitialState(), { type: 'selectLevel', levelId: 1 });
    expect(state.screen).toBe('briefing');
    expect(state.levelId).toBe(1);
  });

  it('第 2 关先进入策略选择，确认后进入说明', () => {
    const selected = apply(createInitialState(), { type: 'selectLevel', levelId: 2 });
    expect(selected.screen).toBe('policy');

    const confirmed = navigate(selected, { type: 'approvePolicy', policyId: 'aggressive' });
    expect(confirmed.screen).toBe('briefing');
    expect(confirmed.policyId).toBe('aggressive');
  });

  it('开始、结算、重玩与返回主菜单形成闭环', () => {
    const driving = apply(
      createInitialState(),
      { type: 'selectLevel', levelId: 1 },
      { type: 'startDriving' },
    );
    expect(driving.screen).toBe('driving');

    const finished = navigate(driving, { type: 'finish', result: result(true) });
    expect(finished.screen).toBe('result');
    expect(finished.result?.passed).toBe(true);

    const retry = navigate(finished, { type: 'retry' });
    expect(retry.screen).toBe('driving');
    expect(retry.result).toBeNull();

    const home = navigate(retry, { type: 'home' });
    expect(home.screen).toBe('menu');
    expect(home.result).toBeNull();
  });

  it('只有通过且存在下一关时才允许进入下一关', () => {
    const failed = apply(
      createInitialState(),
      { type: 'selectLevel', levelId: 2 },
      { type: 'startDriving' },
      { type: 'finish', result: { ...result(false), levelId: 2 } },
    );
    expect(navigate(failed, { type: 'nextLevel', maxLevel: 7 })).toBe(failed);

    const passed = apply(
      createInitialState(),
      { type: 'selectLevel', levelId: 2 },
      { type: 'startDriving' },
      { type: 'finish', result: { ...result(true), levelId: 2 } },
    );
    const next = navigate(passed, { type: 'nextLevel', maxLevel: 7 });
    expect(next.levelId).toBe(3);
    expect(next.screen).toBe('policy');
    expect(next.result).toBeNull();
  });

  it('最后一关通过后不越界', () => {
    const last = apply(
      createInitialState(),
      { type: 'selectLevel', levelId: 7 },
      { type: 'startDriving' },
      { type: 'finish', result: { ...result(true), levelId: 7 } },
    );
    expect(navigate(last, { type: 'nextLevel', maxLevel: 7 })).toBe(last);
  });

  it('主菜单可直接修改默认策略', () => {
    const state = navigate(createInitialState(), { type: 'setPolicy', policyId: 'conservative' });
    expect(state.screen).toBe('menu');
    expect(state.policyId).toBe('conservative');
  });
});
