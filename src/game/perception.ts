import { RISK, SENSOR } from '../config/balance';
import type {
  EgoState,
  EntityState,
  PerceptionLead,
  PerceptionObject,
  PerceptionRay,
  PerceptionSnapshot,
  RiskLevel,
  TrafficLight,
} from '../types/game';
import { obbFromCenter, raycastObb } from './geometry';
import type { SignalSpec } from './scenario';

export interface SignalState extends SignalSpec {
  readonly state: TrafficLight['state'];
  readonly remainingS: number | null;
}

export interface PerceptionWorld {
  readonly ego: EgoState;
  readonly egoWidthM: number;
  readonly egoLengthM: number;
  readonly entities: readonly EntityState[];
  readonly laneCount: number;
  readonly laneWidthM: number;
  readonly speedLimitKmh: number;
  readonly signals: readonly SignalState[];
  readonly crosswalks: readonly number[];
}

/** TTC 风险：>4 安全、2～4 注意、1～2 警告、≤1 危险。 */
export function riskFromTtc(ttcS: number): RiskLevel {
  if (ttcS > RISK.ttcSafeS) {
    return 'safe';
  }
  if (ttcS > RISK.ttcCautionS) {
    return 'caution';
  }
  if (ttcS > RISK.ttcWarningS) {
    return 'warning';
  }
  return 'danger';
}

/** 距离风险：>30 安全、15～30 注意、8～15 警告、≤8 危险。 */
export function riskFromDistance(distanceM: number): RiskLevel {
  if (distanceM > RISK.distanceSafeM) {
    return 'safe';
  }
  if (distanceM > RISK.distanceCautionM) {
    return 'caution';
  }
  if (distanceM > RISK.distanceWarningM) {
    return 'warning';
  }
  return 'danger';
}

function worstRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const order: readonly RiskLevel[] = ['safe', 'caution', 'warning', 'danger'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function signalRisk(): RiskLevel {
  return 'safe';
}

function leadRisk(lead: PerceptionLead, egoSpeedMps: number): RiskLevel {
  if (lead.distanceM < RISK.closeDangerM) {
    return 'danger';
  }
  if (lead.relativeSpeedMps > 0.1) {
    const ttc = lead.ttcS ?? lead.distanceM / Math.max(lead.relativeSpeedMps, 0.1);
    return riskFromTtc(ttc);
  }
  void egoSpeedMps;
  return riskFromDistance(lead.distanceM);
}

/**
 * 感知：把场景真值转换为决策唯一输入。
 * 只读，不修改世界；射线取最近命中，被近处目标遮挡的远端不进入快照。
 */
export function sense(world: PerceptionWorld, tick: number): PerceptionSnapshot {
  const { ego } = world;
  const origin = { x: 0, y: world.egoLengthM / 2 };
  const entities = world.entities;

  const obbs = entities.map((entity) =>
    obbFromCenter(
      entity.lateralM - ego.lateralM,
      entity.s - ego.s,
      entity.widthM,
      entity.lengthM,
      0,
    ),
  );

  const rays: PerceptionRay[] = [];
  for (const angleDeg of SENSOR.rayAnglesDeg) {
    const angle = ego.heading + (angleDeg * Math.PI) / 180;
    let nearest: number = SENSOR.rayRangeM;
    for (const obb of obbs) {
      const hit = raycastObb(origin, angle, SENSOR.rayRangeM, obb);
      if (hit !== null && hit < nearest) {
        nearest = hit;
      }
    }
    rays.push({ angleDeg, distanceM: nearest });
  }

  const objects: PerceptionObject[] = [];
  for (let i = 0; i < entities.length; i += 1) {
    const entity = entities[i];
    const obb = obbs[i];
    if (!entity || !obb) {
      continue;
    }
    const dx = entity.lateralM - ego.lateralM;
    const dy = entity.s - ego.s;
    if (dy <= 0 || dy > SENSOR.rayRangeM) {
      continue;
    }
    const isPedestrian = entity.kind === 'pedestrian';
    if (isPedestrian) {
      const halfRoad = (world.laneCount * world.laneWidthM) / 2;
      if (Math.abs(entity.lateralM) > halfRoad + 2) {
        continue;
      }
    }
    const angle = Math.atan2(dx - origin.x, dy - origin.y);
    const relativeAngle = angle - ego.heading;
    if (!isPedestrian && Math.abs(relativeAngle) > (35 * Math.PI) / 180) {
      continue;
    }

    const ownHit = raycastObb(origin, angle, SENSOR.rayRangeM, obb);
    if (ownHit === null) {
      continue;
    }
    let occluded = false;
    if (!isPedestrian) {
      for (let j = 0; j < obbs.length; j += 1) {
        const other = obbs[j];
        if (j === i || !other) {
          continue;
        }
        const hit = raycastObb(origin, angle, SENSOR.rayRangeM, other);
        if (hit !== null && hit < ownHit - 0.15) {
          occluded = true;
          break;
        }
      }
    }
    if (occluded) {
      continue;
    }

    const centerDistance = Math.hypot(dx, dy);
    const inLane = Math.abs(dx) < world.laneWidthM * 0.55;
    const baseRisk = riskFromDistance(Math.max(0, centerDistance - entity.lengthM / 2));
    objects.push({
      id: entity.id,
      kind: entity.kind,
      forwardM: dy,
      lateralM: dx,
      speedMps: entity.speedMps,
      lengthM: entity.lengthM,
      widthM: entity.widthM,
      risk: inLane && entity.kind !== 'vehicle' ? worstRisk(baseRisk, 'warning') : baseRisk,
    });
  }

  let lead: PerceptionLead | null = null;
  let leadGap = Number.POSITIVE_INFINITY;
  for (const entity of entities) {
    if (entity.kind !== 'vehicle' || entity.lane !== ego.laneIndex) {
      continue;
    }
    const dy = entity.s - ego.s;
    if (dy <= 0 || dy > SENSOR.rayRangeM + 10) {
      continue;
    }
    const gap = Math.max(0, dy - entity.lengthM / 2 - world.egoLengthM / 2);
    if (gap >= leadGap) {
      continue;
    }
    leadGap = gap;
    const relative = ego.speedMps - entity.speedMps;
    lead = {
      id: entity.id,
      distanceM: gap,
      relativeSpeedMps: relative,
      ttcS: relative > 0.1 && ego.speedMps >= 1 ? gap / relative : null,
    };
  }

  let risk: RiskLevel = lead ? leadRisk(lead, ego.speedMps) : 'safe';
  for (const object of objects) {
    if (Math.abs(object.lateralM) < world.laneWidthM * 0.55 && object.kind !== 'vehicle') {
      const gap = Math.max(0, object.forwardM - object.lengthM / 2 - world.egoLengthM / 2);
      if (gap < RISK.distanceWarningM) {
        risk = worstRisk(risk, 'danger');
      } else if (gap < RISK.distanceCautionM) {
        risk = worstRisk(risk, 'warning');
      }
    }
  }

  const rear: PerceptionObject[] = [];
  for (const entity of entities) {
    if (entity.kind !== 'vehicle' || entity.lane === ego.laneIndex) {
      continue;
    }
    const dy = entity.s - ego.s;
    if (dy >= -2 || dy < -SENSOR.rearRangeM) {
      continue;
    }
    rear.push({
      id: entity.id,
      kind: entity.kind,
      forwardM: dy,
      lateralM: entity.lateralM - ego.lateralM,
      speedMps: entity.speedMps,
      lengthM: entity.lengthM,
      widthM: entity.widthM,
      risk: riskFromDistance(-dy),
    });
  }
  rear.sort((a, b) => b.forwardM - a.forwardM);

  const roadHalf = (world.laneCount * world.laneWidthM) / 2;
  const aheadSignal = world.signals
    .filter((signal) => signal.s >= ego.s - 0.5 && signal.s - ego.s <= SENSOR.rayRangeM)
    .sort((a, b) => a.s - b.s)[0];

  const light: TrafficLight = aheadSignal
    ? { state: aheadSignal.state, remainingS: aheadSignal.remainingS }
    : { state: 'none', remainingS: null };

  const onCrosswalk = world.crosswalks.some((s) => Math.abs(s - ego.s) <= 4);

  return {
    tick,
    ego: {
      speedMps: ego.speedMps,
      laneIndex: ego.laneIndex,
      lateralOffsetM: ego.lateralM,
    },
    lead,
    rays,
    objects,
    lane: {
      laneCount: world.laneCount,
      widthM: world.laneWidthM,
      leftLineM: ego.lateralM + roadHalf - world.egoWidthM / 2,
      rightLineM: roadHalf - ego.lateralM - world.egoWidthM / 2,
      stopLineM: aheadSignal ? aheadSignal.s - ego.s : null,
      onCrosswalk,
      speedLimitKmh: world.speedLimitKmh,
    },
    light,
    rear,
    risk,
  };
}

export { signalRisk };
