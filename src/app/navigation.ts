import { DEFAULT_POLICY, type PolicyId } from '../config/policies';
import type { ScoreResult } from '../game/scoring';
import type { Telemetry } from '../game/telemetry';

export type Screen = 'menu' | 'levelSelect' | 'policy' | 'briefing' | 'driving' | 'result';

export type FinishReason = 'arrived' | 'collision' | 'safeStop' | 'quit';

export interface BestSnapshot {
  readonly score: number;
  readonly stars: number;
}

export interface RunResult {
  readonly levelId: number;
  readonly passed: boolean;
  readonly reason: FinishReason;
  readonly distanceM: number;
  readonly durationS: number;
  readonly report: ScoreResult;
  readonly telemetry: Telemetry;
  readonly policyId: PolicyId;
  readonly seed: number;
  readonly bestBefore: BestSnapshot | null;
  readonly tutorialSkipped: boolean;
}

export interface AppState {
  readonly screen: Screen;
  readonly levelId: number | null;
  readonly policyId: PolicyId;
  readonly result: RunResult | null;
}

export type AppAction =
  | { type: 'home' }
  | { type: 'openLevels' }
  | { type: 'setPolicy'; policyId: PolicyId }
  | { type: 'selectLevel'; levelId: number }
  | { type: 'approvePolicy'; policyId: PolicyId }
  | { type: 'backToLevels' }
  | { type: 'startDriving' }
  | { type: 'finish'; result: RunResult }
  | { type: 'retry' }
  | { type: 'nextLevel'; maxLevel: number };

export function createInitialState(policyId: PolicyId = DEFAULT_POLICY): AppState {
  return { screen: 'menu', levelId: null, policyId, result: null };
}

/**
 * 全局导航状态机：纯函数，禁止在屏幕组件里直接改状态。
 * 第 1 关为手动教学，跳过策略选择。
 */
export function navigate(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'home':
      return { ...state, screen: 'menu', result: null };
    case 'openLevels':
      return { ...state, screen: 'levelSelect' };
    case 'setPolicy':
      return { ...state, policyId: action.policyId };
    case 'selectLevel':
      return {
        ...state,
        levelId: action.levelId,
        result: null,
        screen: action.levelId === 1 ? 'briefing' : 'policy',
      };
    case 'approvePolicy':
      return { ...state, policyId: action.policyId, screen: 'briefing' };
    case 'backToLevels':
      return { ...state, screen: 'levelSelect' };
    case 'startDriving':
      return { ...state, screen: 'driving', result: null };
    case 'finish':
      return { ...state, screen: 'result', result: action.result };
    case 'retry':
      return { ...state, screen: 'driving', result: null };
    case 'nextLevel': {
      if (state.levelId === null || state.result === null || !state.result.passed) {
        return state;
      }
      const next = state.levelId + 1;
      if (next > action.maxLevel) {
        return state;
      }
      return {
        ...state,
        levelId: next,
        screen: next === 1 ? 'briefing' : 'policy',
        result: null,
      };
    }
  }
}
