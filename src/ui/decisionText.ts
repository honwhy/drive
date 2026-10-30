import type { DecisionState } from '../types/hud';

/** 状态与原因码到文案的映射；原因码由决策模块输出，二者保持分离。 */
const STATE_LABELS: Readonly<Record<DecisionState, string>> = {
  cruise: '巡航',
  follow: '跟车',
  laneChange: '变道',
  yield: '让行',
  stop: '停车',
  decelerate: '减速',
  takeoverRequest: '请求接管',
  manual: '手动',
  finished: '结束',
};

const REASON_LABELS: Readonly<Record<string, string>> = {
  keepLane: '保持车道居中',
  followLead: '保持安全时距',
  leadSlower: '前车较慢，准备变道',
  obstacleAhead: '前方障碍，减速绕行',
  laneChangeLeft: '向左变道中',
  laneChangeRight: '向右变道中',
  redLight: '红灯，停止线前停车',
  redLightAhead: '前方有信号灯，减速准备停车',
  yellowLightAhead: '前方有信号灯，减速准备停车',
  pedestrianAhead: '前方行人，减速准备让行',
  leadSlowerWait: '前车较慢，等待变道窗口',
  greenLight: '绿灯通过',
  pedestrian: '礼让行人',
  pedestrianClear: '等待行人完全离开人行横道',
  stopLine: '停止线前停车',
  manualControl: '人工控制中',
  activeTakeover: '玩家主动接管',
  finished: '已到达终点',
  safeStop: '安全停车',
  aeb: '自动紧急制动',
  laneChangeAbort: '变道中止，回到原车道',
  laneChangeComplete: '变道完成',
  yellowLight: '黄灯，按舒适制动停车',
  unavoidableCollision: '预测 3.5 秒内可能碰撞，自动制动难以避免',
  blockedLane: '前方车道被占用，暂无安全变道窗口',
  gapTooSmall: '前车距离不足，暂不能交还',
  riskTooHigh: '当前风险较高，暂不能交还',
  nearIntersection: '接近路口或人行横道，暂不能交还',
  laneChanging: '变道进行中，暂不能交还',
  notManual: '当前不在手动模式',
  noPerception: '感知数据尚未就绪',
};

const UNKNOWN_REASON = '保持当前状态';

export interface DecisionText {
  readonly state: string;
  readonly reason: string;
}

export function describeDecision(state: DecisionState, reasonCode: string): DecisionText {
  return {
    state: STATE_LABELS[state],
    reason: REASON_LABELS[reasonCode] ?? UNKNOWN_REASON,
  };
}

export function reasonLabel(reasonCode: string): string {
  return REASON_LABELS[reasonCode] ?? UNKNOWN_REASON;
}
