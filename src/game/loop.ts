/**
 * 固定步长循环：把渲染帧间隔换算成整数个物理步。
 * 纯逻辑，不依赖 requestAnimationFrame，便于单元测试。
 */
export interface FixedLoopOptions {
  readonly stepSeconds: number;
  readonly maxStepsPerFrame: number;
  readonly maxFrameSeconds: number;
}

export interface FixedLoop {
  /** 传入本帧间隔（秒），返回应推进的物理步数 */
  advance(frameSeconds: number): number;
  reset(): void;
  readonly pendingSeconds: number;
}

const EPSILON = 1e-9;

export function createFixedLoop(options: FixedLoopOptions): FixedLoop {
  const { stepSeconds, maxStepsPerFrame, maxFrameSeconds } = options;
  let accumulator = 0;

  if (stepSeconds <= 0) {
    throw new Error('stepSeconds 必须大于 0');
  }
  if (maxStepsPerFrame <= 0) {
    throw new Error('maxStepsPerFrame 必须大于 0');
  }

  return {
    advance(frameSeconds: number): number {
      const safeFrame = Number.isFinite(frameSeconds) ? frameSeconds : 0;
      const clamped = Math.min(Math.max(safeFrame, 0), maxFrameSeconds);
      accumulator += clamped;

      let steps = 0;
      while (accumulator + EPSILON >= stepSeconds && steps < maxStepsPerFrame) {
        accumulator -= stepSeconds;
        steps += 1;
      }

      // 触顶说明发生了卡顿或切后台，丢弃剩余时间，不做“时间债”
      if (steps === maxStepsPerFrame && accumulator > stepSeconds) {
        accumulator = 0;
      }

      return steps;
    },
    reset(): void {
      accumulator = 0;
    },
    get pendingSeconds(): number {
      return accumulator;
    },
  };
}
