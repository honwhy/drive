import type { DecisionState, DriveMode, RiskLevel } from './game';

export type { DecisionState, DriveMode, RiskLevel } from './game';

/** HUD 只读模型：UI 不得访问世界对象，所有数据由驾驶屏组装。 */
export interface HudModel {
  readonly levelName: string;
  readonly policyName: string;
  readonly speedKmh: number;
  readonly leadDistanceM: number | null;
  readonly leadTtcS: number | null;
  readonly risk: RiskLevel;
  readonly mode: DriveMode;
  readonly decision: {
    readonly state: DecisionState;
    readonly reasonCode: string;
    /** 距离等补充信息，如“距离 96 m” */
    readonly detail: string | null;
  };
  readonly progress: {
    readonly travelledM: number;
    readonly totalM: number;
  };
  /** 系统请求接管时的剩余秒数；其余情况为 null */
  readonly takeoverRemainingS: number | null;
  /** 系统请求接管的原因文案；其余情况为 null */
  readonly takeoverReason: string | null;
}

export type HudEventTone = 'info' | 'warning' | 'danger';

export interface HudEvent {
  readonly text: string;
  readonly tone?: HudEventTone;
}
