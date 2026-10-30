import { DECISION } from '../../config/balance';

/** ACC 目标速度：目标距离 = max(5 m, v × 时距)。 */
export function followTargetSpeed(
  gapM: number,
  egoSpeedMps: number,
  leadSpeedMps: number,
  timeHeadwayS: number,
  baseSpeedMps: number,
): number {
  const targetGap = Math.max(5, egoSpeedMps * timeHeadwayS);
  if (gapM < targetGap - DECISION.brakeMarginM) {
    // 距离不足时按净距计算可停速度，避免追尾
    const safeSpeed = Math.sqrt(Math.max(0, 2 * DECISION.maxBrakeMps2 * Math.max(gapM - 2, 0)));
    return Math.min(leadSpeedMps, safeSpeed, baseSpeedMps);
  }
  if (gapM > targetGap + DECISION.accelMarginM) {
    return Math.min(baseSpeedMps, leadSpeedMps + 8);
  }
  return Math.min(baseSpeedMps, leadSpeedMps);
}

/** 信号灯/停止线目标速度：预留执行器滞后，但最终停在目标点附近。 */
export function stopLineTargetSpeed(distanceToStopM: number, baseSpeedMps: number): number {
  if (distanceToStopM <= 0.5) {
    return 0;
  }
  const planningDecel = DECISION.comfortableBrakeMps2 * 0.3;
  return Math.min(baseSpeedMps, Math.sqrt(2 * planningDecel * distanceToStopM));
}

/** 静止障碍目标速度：距离越近目标越低；预留执行器滞后与安全余量。 */
export function obstacleTargetSpeed(gapM: number, baseSpeedMps: number): number {
  if (gapM <= 5) {
    return 0;
  }
  const planningDecel = DECISION.comfortableBrakeMps2 * 0.7;
  const safeSpeed = Math.sqrt(Math.max(0, 2 * planningDecel * (gapM - 5)));
  return Math.min(baseSpeedMps, safeSpeed);
}
