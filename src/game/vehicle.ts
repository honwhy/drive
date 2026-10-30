import { VEHICLE } from '../config/balance';
import type { EgoState, VehicleInput } from '../types/game';

export function laneCenter(laneIndex: number, laneCount: number, laneWidthM: number): number {
  return (laneIndex - (laneCount - 1) / 2) * laneWidthM;
}

export function laneIndexOf(lateralM: number, laneCount: number, laneWidthM: number): number {
  const raw = Math.round(lateralM / laneWidthM + (laneCount - 1) / 2);
  return Math.min(Math.max(raw, 0), laneCount - 1);
}

export function roadHalfWidth(laneCount: number, laneWidthM: number): number {
  return (laneCount * laneWidthM) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 纯函数车辆步进：纵向油门/刹车 + 横向转向，返回新状态。
 * 物理步长由调用方固定，不在此处读取时间。
 */
export function stepVehicle(
  state: EgoState,
  input: VehicleInput,
  dt: number,
  maxSpeedMps: number,
  laneCount: number,
  laneWidthM: number,
): EgoState {
  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  const steer = clamp(input.steer, -1, 1);

  const coast = throttle < 0.01 && brake < 0.01 ? -VEHICLE.coastMps2 : 0;
  const targetAccel =
    throttle * VEHICLE.accelMps2 -
    brake * (input.emergency ? VEHICLE.emergencyBrakeMps2 : VEHICLE.brakeMps2) +
    coast;

  const maxDelta = VEHICLE.longitudinalJerk * dt;
  const accel = state.accelMps2 + clamp(targetAccel - state.accelMps2, -maxDelta, maxDelta);

  let speed = state.speedMps + accel * dt;
  if (speed < 0) {
    speed = 0;
  }
  if (speed > maxSpeedMps) {
    speed = maxSpeedMps;
  }

  const maxLateralSpeed = speed < 0.3 ? 0 : Math.min(2.4, speed * 0.12);
  const desiredLateral = steer * maxLateralSpeed;
  const lateralAccel = clamp(
    (desiredLateral - state.lateralVelMps) * VEHICLE.lateralJerk,
    -VEHICLE.maxLateralAccel,
    VEHICLE.maxLateralAccel,
  );
  const lateralVel = state.lateralVelMps + lateralAccel * dt;
  const lateralM = state.lateralM + lateralVel * dt;

  return {
    s: state.s + speed * dt,
    lateralM,
    heading: Math.atan2(lateralVel, Math.max(speed, 4)) * 0.6,
    speedMps: speed,
    accelMps2: speed === 0 && accel < 0 ? 0 : accel,
    lateralVelMps: lateralVel,
    steer,
    laneIndex: laneIndexOf(lateralM, laneCount, laneWidthM),
  };
}

export function createEgoState(
  startSpeedMps: number,
  laneIndex: number,
  laneCount: number,
  laneWidthM: number,
): EgoState {
  return {
    s: 0,
    lateralM: laneCenter(laneIndex, laneCount, laneWidthM),
    heading: 0,
    speedMps: startSpeedMps,
    accelMps2: 0,
    lateralVelMps: 0,
    steer: 0,
    laneIndex,
  };
}
