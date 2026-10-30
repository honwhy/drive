import type { PerceptionSnapshot } from '../../types/game';
import type { PolicyConfig } from '../../config/policies';

export interface LaneCandidate {
  readonly laneIndex: number;
  readonly safe: boolean;
  readonly frontGapM: number;
  readonly rearArrivalS: number;
}

function laneOf(lateralM: number, laneCount: number, laneWidthM: number): number {
  const raw = Math.round(lateralM / laneWidthM + (laneCount - 1) / 2);
  return Math.min(Math.max(raw, 0), laneCount - 1);
}

/** 评估目标车道的 safety：前向净距 + 后车到达时间。 */
export function evaluateLaneCandidate(
  snapshot: PerceptionSnapshot,
  targetLane: number,
  policy: PolicyConfig,
  egoLengthM: number,
): LaneCandidate {
  const width = snapshot.lane.widthM;
  const egoLateral = snapshot.ego.lateralOffsetM;

  let frontGapM = Number.POSITIVE_INFINITY;
  for (const object of snapshot.objects) {
    const objectLane = laneOf(egoLateral + object.lateralM, snapshot.lane.laneCount, width);
    if (objectLane !== targetLane || object.forwardM <= 0) {
      continue;
    }
    const gap = object.forwardM - object.lengthM / 2 - egoLengthM / 2;
    if (gap < frontGapM) {
      frontGapM = gap;
    }
  }

  let rearArrivalS = Number.POSITIVE_INFINITY;
  for (const object of snapshot.rear) {
    const objectLane = laneOf(egoLateral + object.lateralM, snapshot.lane.laneCount, width);
    if (objectLane !== targetLane) {
      continue;
    }
    const closing = object.speedMps - snapshot.ego.speedMps;
    const arrival = closing > 0.2 ? -object.forwardM / closing : Number.POSITIVE_INFINITY;
    if (arrival < rearArrivalS) {
      rearArrivalS = arrival;
    }
  }

  const safe =
    frontGapM >= policy.laneChange.frontGapM && rearArrivalS >= policy.laneChange.rearArrivalS;
  return { laneIndex: targetLane, safe, frontGapM, rearArrivalS };
}

/** 选择目标车道：优先前方空间大者，条件相同时优先左侧。 */
export function chooseLaneCandidate(
  snapshot: PerceptionSnapshot,
  policy: PolicyConfig,
  egoLengthM: number,
): LaneCandidate | null {
  const current = snapshot.ego.laneIndex;
  const candidates: LaneCandidate[] = [];
  for (const lane of [current - 1, current + 1]) {
    if (lane < 0 || lane >= snapshot.lane.laneCount) {
      continue;
    }
    candidates.push(evaluateLaneCandidate(snapshot, lane, policy, egoLengthM));
  }
  const safe = candidates.filter((candidate) => candidate.safe);
  if (safe.length === 0) {
    return null;
  }
  safe.sort((a, b) => {
    if (Math.abs(b.frontGapM - a.frontGapM) > 1) {
      return b.frontGapM - a.frontGapM;
    }
    return a.laneIndex - b.laneIndex;
  });
  return safe[0] ?? null;
}
