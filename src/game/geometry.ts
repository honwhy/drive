import type { Obb, Vec2 } from '../types/game';

/** 由中心与朝向构造矩形，forward 为车头方向。 */
export function obbFromCenter(
  cx: number,
  cy: number,
  widthM: number,
  lengthM: number,
  heading: number,
): Obb {
  return { cx, cy, halfWidth: widthM / 2, halfLength: lengthM / 2, heading };
}

export function forwardVector(heading: number): Vec2 {
  return { x: Math.sin(heading), y: Math.cos(heading) };
}

export function rightVector(heading: number): Vec2 {
  return { x: Math.cos(heading), y: -Math.sin(heading) };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function radiusOnAxis(obb: Obb, axis: Vec2): number {
  const forward = forwardVector(obb.heading);
  const right = rightVector(obb.heading);
  return obb.halfLength * Math.abs(dot(forward, axis)) + obb.halfWidth * Math.abs(dot(right, axis));
}

/** OBB/SAT 相交判定（分离轴定理）。 */
export function obbOverlap(a: Obb, b: Obb): boolean {
  const axes: readonly Vec2[] = [
    forwardVector(a.heading),
    rightVector(a.heading),
    forwardVector(b.heading),
    rightVector(b.heading),
  ];
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  for (const axis of axes) {
    const distance = Math.abs(dx * axis.x + dy * axis.y);
    if (distance > radiusOnAxis(a, axis) + radiusOnAxis(b, axis)) {
      return false;
    }
  }
  return true;
}

/**
 * 射线与 OBB 求交，返回最近距离；angle 以 +y 为 0、向 +x 为正。
 * 使用 slab 法，未命中返回 null。
 */
export function raycastObb(
  origin: Vec2,
  angle: number,
  maxRangeM: number,
  obb: Obb,
): number | null {
  const right = rightVector(obb.heading);
  const forward = forwardVector(obb.heading);
  const ox = origin.x - obb.cx;
  const oy = origin.y - obb.cy;
  const localOx = ox * right.x + oy * right.y;
  const localOy = ox * forward.x + oy * forward.y;

  const dirX = Math.sin(angle);
  const dirY = Math.cos(angle);
  const localDx = dirX * right.x + dirY * right.y;
  const localDy = dirX * forward.x + dirY * forward.y;

  let tMin = 0;
  let tMax = maxRangeM;

  const slabs: readonly [number, number, number][] = [
    [localOx, localDx, obb.halfWidth],
    [localOy, localDy, obb.halfLength],
  ];

  for (const [originAxis, dirAxis, half] of slabs) {
    if (Math.abs(dirAxis) < 1e-9) {
      if (originAxis < -half || originAxis > half) {
        return null;
      }
      continue;
    }
    let t1 = (-half - originAxis) / dirAxis;
    let t2 = (half - originAxis) / dirAxis;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) {
      return null;
    }
  }

  if (tMax < 0 || tMin > maxRangeM) {
    return null;
  }
  return Math.max(tMin, 0);
}

export function raycastObbs(
  origin: Vec2,
  angle: number,
  maxRangeM: number,
  obstacles: readonly Obb[],
): number {
  let nearest = maxRangeM;
  for (const obb of obstacles) {
    const hit = raycastObb(origin, angle, maxRangeM, obb);
    if (hit !== null && hit < nearest) {
      nearest = hit;
    }
  }
  return nearest;
}

export function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
