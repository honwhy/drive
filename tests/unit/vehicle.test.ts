import { describe, expect, it } from 'vitest';
import type { EgoState } from '../../src/types/game';
import { createEgoState, laneCenter, laneIndexOf, stepVehicle } from '../../src/game/vehicle';

const input = (throttle: number, brake: number, steer: number) => ({
  throttle,
  brake,
  steer,
  emergency: false,
});

function run(
  seconds: number,
  throttle: number,
  brake: number,
  steer: number,
  dt = 1 / 60,
): EgoState {
  let state = createEgoState(0, 0, 2, 3.5);
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) {
    state = stepVehicle(state, input(throttle, brake, steer), dt, 60 / 3.6, 2, 3.5);
  }
  return state;
}

describe('车辆运动', () => {
  it('加速到上限后稳定，不超速', () => {
    const state = run(20, 1, 0, 0);
    expect(state.speedMps).toBeCloseTo(60 / 3.6, 2);
    expect(state.s).toBeGreaterThan(100);
  });

  it('制动到停，不倒退', () => {
    let state = createEgoState(20, 0, 2, 3.5);
    for (let i = 0; i < 600; i += 1) {
      state = stepVehicle(state, input(0, 1, 0), 1 / 60, 120 / 3.6, 2, 3.5);
    }
    expect(state.speedMps).toBe(0);
    expect(state.s).toBeGreaterThan(0);
  });

  it('转向后松开自动回正', () => {
    const start = createEgoState(15, 0, 3, 3.5);
    let state = start;
    for (let i = 0; i < 120; i += 1) {
      state = stepVehicle(state, input(1, 0, 1), 1 / 60, 120 / 3.6, 3, 3.5);
    }
    expect(state.lateralM).toBeGreaterThan(start.lateralM + 1.5);
    for (let i = 0; i < 240; i += 1) {
      state = stepVehicle(state, input(1, 0, 0), 1 / 60, 120 / 3.6, 3, 3.5);
    }
    expect(Math.abs(state.lateralVelMps)).toBeLessThan(0.05);
    expect(Math.abs(state.heading)).toBeLessThan(0.01);
  });

  it('停车后横向不移动', () => {
    const state = run(2, 0, 1, 1);
    expect(state.lateralM).toBeCloseTo(laneCenter(0, 2, 3.5), 3);
  });

  it('30/60/120 Hz 轨迹一致', () => {
    let a = createEgoState(0, 0, 2, 3.5);
    let b = createEgoState(0, 0, 2, 3.5);
    let c = createEgoState(0, 0, 2, 3.5);
    for (let i = 0; i < 300; i += 1)
      a = stepVehicle(a, input(1, 0, 0.2), 1 / 30, 120 / 3.6, 2, 3.5);
    for (let i = 0; i < 600; i += 1)
      b = stepVehicle(b, input(1, 0, 0.2), 1 / 60, 120 / 3.6, 2, 3.5);
    for (let i = 0; i < 1200; i += 1)
      c = stepVehicle(c, input(1, 0, 0.2), 1 / 120, 120 / 3.6, 2, 3.5);
    expect(Math.abs(a.s - b.s) / Math.max(a.s, 1)).toBeLessThan(0.01);
    expect(Math.abs(b.s - c.s) / Math.max(b.s, 1)).toBeLessThan(0.01);
  });

  it('车道中心与车道号换算', () => {
    expect(laneCenter(0, 3, 3.5)).toBeCloseTo(-3.5, 5);
    expect(laneCenter(2, 3, 3.5)).toBeCloseTo(3.5, 5);
    expect(laneIndexOf(laneCenter(2, 3, 3.5), 3, 3.5)).toBe(2);
    expect(laneIndexOf(99, 3, 3.5)).toBe(2);
  });
});
