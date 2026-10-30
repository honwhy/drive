import { describe, expect, it } from 'vitest';
import { createFixedLoop } from '../../src/game/loop';

const STEP = 1 / 60;

function makeLoop(): ReturnType<typeof createFixedLoop> {
  return createFixedLoop({ stepSeconds: STEP, maxStepsPerFrame: 5, maxFrameSeconds: 0.25 });
}

describe('createFixedLoop', () => {
  it('按固定步长推进，不把渲染帧间隔当作物理步长', () => {
    const loop = makeLoop();
    expect(loop.advance(STEP)).toBe(1);
    expect(loop.advance(STEP / 2)).toBe(0);
    expect(loop.advance(STEP / 2)).toBe(1);
  });

  it('单帧最多追赶 5 步', () => {
    const loop = makeLoop();
    expect(loop.advance(0.2)).toBe(5);
    expect(loop.pendingSeconds).toBeLessThan(STEP);
  });

  it('帧间隔上限 250 ms，卡顿不产生时间债', () => {
    const loop = makeLoop();
    loop.advance(10);
    expect(loop.pendingSeconds).toBeLessThan(STEP);
    expect(loop.advance(STEP)).toBe(1);
  });

  it('非法帧间隔按 0 处理', () => {
    const loop = makeLoop();
    expect(loop.advance(Number.NaN)).toBe(0);
    expect(loop.advance(-1)).toBe(0);
    expect(loop.pendingSeconds).toBe(0);
  });

  it('reset 清空累加器', () => {
    const loop = makeLoop();
    loop.advance(STEP / 2);
    loop.reset();
    expect(loop.pendingSeconds).toBe(0);
    expect(loop.advance(STEP / 2)).toBe(0);
  });
});
