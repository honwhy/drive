import { DECISION } from '../config/balance';
import type { VehicleInput } from '../types/game';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 速度控制器：把目标速度转换为油门/刹车；常规制动不超过 3.0 m/s²。 */
export function speedControl(
  speedMps: number,
  targetSpeedMps: number,
  emergency = false,
): VehicleInput {
  if (emergency) {
    return { throttle: 0, brake: 1, steer: 0, emergency: true };
  }

  if (targetSpeedMps < 0.2) {
    return {
      throttle: 0,
      brake: speedMps <= 0.05 ? 0.4 : 0.75,
      steer: 0,
      emergency: false,
    };
  }

  const error = targetSpeedMps - speedMps;
  if (error > 0.4) {
    return {
      throttle: clamp(error * 0.35 + 0.1, 0.08, 1),
      brake: 0,
      steer: 0,
      emergency: false,
    };
  }
  if (error < -0.4) {
    const brake = clamp(-error * 0.2 + 0.1, 0.1, 0.75);
    return { throttle: 0, brake, steer: 0, emergency: false };
  }
  return { throttle: 0.04, brake: 0, steer: 0, emergency: false };
}

/** 车道保持/变道转向：根据横向误差与横向速度给出方向盘输入。 */
export function laneSteer(
  lateralM: number,
  lateralVelMps: number,
  targetLateralM: number,
  speedMps: number,
): number {
  if (speedMps < 0.3) {
    return 0;
  }
  const error = targetLateralM - lateralM;
  const desiredLateralVel = clamp(error * 0.9, -2.4, 2.4);
  return clamp((desiredLateralVel - lateralVelMps) * 0.8, -1, 1);
}

/** 前车净距所需减速度：vRel² / (2 × 净距)。 */
export function requiredDeceleration(relativeSpeedMps: number, gapM: number): number {
  if (relativeSpeedMps <= 0.1) {
    return 0;
  }
  return (relativeSpeedMps * relativeSpeedMps) / (2 * Math.max(gapM, 0.1));
}

/** 以目标减速度在给定距离内停车所需速度上限。 */
export function comfortableStopSpeed(distanceM: number): number {
  return Math.sqrt(Math.max(0, 2 * DECISION.comfortableBrakeMps2 * Math.max(distanceM, 0)));
}
