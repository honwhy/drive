/** 三种策略预设；F07 会补充生效逻辑与自定义策略。 */
export type PolicyId = 'conservative' | 'normal' | 'aggressive';

export interface PolicyConfig {
  readonly id: PolicyId;
  readonly name: string;
  readonly summary: string;
  readonly timeHeadwayS: number;
  readonly maxSpeedKmh: number;
  readonly reactionTimeS: number;
  readonly laneChange: {
    readonly slowDeltaMps: number;
    readonly holdS: number;
    readonly frontGapM: number;
    readonly rearArrivalS: number;
  };
}

export const POLICIES: readonly PolicyConfig[] = [
  {
    id: 'conservative',
    name: '保守',
    summary: '跟车更远、变道更谨慎，适合先熟悉流程',
    timeHeadwayS: 2.2,
    maxSpeedKmh: 90,
    reactionTimeS: 0.6,
    laneChange: { slowDeltaMps: 5, holdS: 3, frontGapM: 20, rearArrivalS: 5 },
  },
  {
    id: 'normal',
    name: '普通',
    summary: '跟车距离与变道积极性均衡，推荐首次游玩',
    timeHeadwayS: 1.6,
    maxSpeedKmh: 110,
    reactionTimeS: 0.4,
    laneChange: { slowDeltaMps: 3, holdS: 2, frontGapM: 15, rearArrivalS: 3.5 },
  },
  {
    id: 'aggressive',
    name: '激进',
    summary: '跟车更近、变道更积极，评分风险更高',
    timeHeadwayS: 1.0,
    maxSpeedKmh: 120,
    reactionTimeS: 0.25,
    laneChange: { slowDeltaMps: 1.5, holdS: 1.5, frontGapM: 10, rearArrivalS: 2.5 },
  },
];

export const DEFAULT_POLICY: PolicyId = 'normal';

export function getPolicy(id: PolicyId): PolicyConfig {
  const policy = POLICIES.find((item) => item.id === id);
  if (!policy) {
    throw new Error(`未知策略：${id}`);
  }
  return policy;
}
