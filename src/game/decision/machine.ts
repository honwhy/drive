import { DECISION } from '../../config/balance';
import type { PolicyConfig } from '../../config/policies';
import type { DecisionState, PerceptionSnapshot } from '../../types/game';
import { laneSteer } from '../control';
import { laneCenter } from '../vehicle';
import { evaluateAeb } from './aeb';
import { followTargetSpeed, obstacleTargetSpeed, stopLineTargetSpeed } from './acc';
import { chooseLaneCandidate, evaluateLaneCandidate } from './laneChange';

export type LaneChangeEvent = 'started' | 'completed' | 'aborted' | null;

export interface DecisionOutput {
  readonly state: DecisionState;
  readonly reasonCode: string;
  readonly targetSpeedMps: number;
  readonly steer: number;
  readonly emergencyBrake: boolean;
  readonly aebActive: boolean;
  readonly laneChangeEvent: LaneChangeEvent;
  readonly takeoverReason: string | null;
}

type LanePhase = 'idle' | 'signal' | 'execute' | 'abort' | 'cooldown';

interface Blocker {
  readonly id: string;
  readonly gapM: number;
  readonly speedMps: number;
  readonly kind: 'vehicle' | 'static' | 'pedestrian';
}

const DECISION_DT = 1 / 15;
const EGO_LENGTH_M = 4.8;

function isStaticKind(kind: string): boolean {
  return kind === 'obstacle' || kind === 'construction';
}

export interface DecisionMachine {
  update(snapshot: PerceptionSnapshot): DecisionOutput;
  reset(): void;
  readonly laneChangePhase: LanePhase;
}

/**
 * 显式状态机：CRUISE / FOLLOW / LANE_CHANGE / YIELD / STOP / TAKEOVER_REQUEST。
 * 只消费感知快照，不读取世界实体真值。
 */
export function createDecisionMachine(policy: PolicyConfig): DecisionMachine {
  let lanePhase: LanePhase = 'idle';
  let laneTarget: number | null = null;
  let laneOriginal = 0;
  let laneTimer = 0;
  let cooldown = 0;
  let slowLeadTimer = 0;
  let lastLateral: number | null = null;
  let pedestrianWaitS: number = DECISION.pedestrianClearWaitS;

  const abortLaneChange = (): LaneChangeEvent => {
    if (lanePhase === 'signal' || lanePhase === 'execute') {
      lanePhase = 'abort';
      laneTarget = laneOriginal;
      laneTimer = 0;
      return 'aborted';
    }
    return null;
  };

  const steerToward = (
    lateralM: number,
    snapshot: PerceptionSnapshot,
    targetLane: number,
  ): number => {
    const target = laneCenter(targetLane, snapshot.lane.laneCount, snapshot.lane.widthM);
    const lateralVel = lastLateral === null ? 0 : (lateralM - lastLateral) / DECISION_DT;
    return laneSteer(lateralM, lateralVel, target, snapshot.ego.speedMps);
  };

  const startLaneChange = (targetLane: number, snapshot: PerceptionSnapshot): void => {
    lanePhase = 'signal';
    laneTarget = targetLane;
    laneOriginal = snapshot.ego.laneIndex;
    laneTimer = 0;
  };

  const updateLaneChange = (
    snapshot: PerceptionSnapshot,
    baseSpeedMps: number,
  ): { output: DecisionOutput | null; event: LaneChangeEvent } => {
    if (lanePhase === 'idle') {
      return { output: null, event: null };
    }
    if (lanePhase === 'cooldown') {
      cooldown -= DECISION_DT;
      if (cooldown <= 0) {
        lanePhase = 'idle';
        laneTarget = null;
      }
      return { output: null, event: null };
    }

    laneTimer += DECISION_DT;
    const target = laneTarget ?? snapshot.ego.laneIndex;

    if (lanePhase === 'signal') {
      const justSignaled = laneTimer <= DECISION_DT + 1e-6;
      if (laneTimer >= DECISION.laneChangeSignalS) {
        lanePhase = 'execute';
        laneTimer = 0;
      }
      return {
        output: {
          state: 'laneChange',
          reasonCode: target < laneOriginal ? 'laneChangeLeft' : 'laneChangeRight',
          targetSpeedMps: baseSpeedMps,
          steer: steerToward(snapshot.ego.lateralOffsetM, snapshot, target),
          emergencyBrake: false,
          aebActive: false,
          laneChangeEvent: justSignaled ? 'started' : null,
          takeoverReason: null,
        },
        event: justSignaled ? 'started' : null,
      };
    }

    if (lanePhase === 'execute') {
      if (laneTimer > 0.8) {
        const candidate = evaluateLaneCandidate(snapshot, target, policy, EGO_LENGTH_M);
        if (
          !candidate.safe &&
          (candidate.frontGapM < policy.laneChange.frontGapM * 0.5 ||
            candidate.rearArrivalS < policy.laneChange.rearArrivalS * 0.5)
        ) {
          lanePhase = 'abort';
          laneTarget = laneOriginal;
          laneTimer = 0;
          return {
            output: {
              state: 'laneChange',
              reasonCode: 'laneChangeAbort',
              targetSpeedMps: baseSpeedMps,
              steer: steerToward(snapshot.ego.lateralOffsetM, snapshot, laneOriginal),
              emergencyBrake: false,
              aebActive: false,
              laneChangeEvent: 'aborted',
              takeoverReason: null,
            },
            event: 'aborted',
          };
        }
      }

      const center = laneCenter(target, snapshot.lane.laneCount, snapshot.lane.widthM);
      const reached = Math.abs(snapshot.ego.lateralOffsetM - center) <= 0.2;
      if ((reached && laneTimer >= DECISION.laneChangeMinS) || laneTimer >= 4.5) {
        lanePhase = 'cooldown';
        cooldown = DECISION.laneChangeCooldownS;
        laneTarget = null;
        laneTimer = 0;
        return {
          output: {
            state: 'laneChange',
            reasonCode: 'laneChangeComplete',
            targetSpeedMps: baseSpeedMps,
            steer: 0,
            emergencyBrake: false,
            aebActive: false,
            laneChangeEvent: 'completed',
            takeoverReason: null,
          },
          event: 'completed',
        };
      }
      return {
        output: {
          state: 'laneChange',
          reasonCode: target < laneOriginal ? 'laneChangeLeft' : 'laneChangeRight',
          targetSpeedMps: baseSpeedMps,
          steer: steerToward(snapshot.ego.lateralOffsetM, snapshot, target),
          emergencyBrake: false,
          aebActive: false,
          laneChangeEvent: null,
          takeoverReason: null,
        },
        event: null,
      };
    }

    // abort：回到原车道
    const center = laneCenter(laneOriginal, snapshot.lane.laneCount, snapshot.lane.widthM);
    if (Math.abs(snapshot.ego.lateralOffsetM - center) <= 0.2 || laneTimer >= 3) {
      lanePhase = 'cooldown';
      cooldown = DECISION.laneChangeCooldownS;
      laneTarget = null;
      laneTimer = 0;
    }
    return {
      output: {
        state: 'laneChange',
        reasonCode: 'laneChangeAbort',
        targetSpeedMps: baseSpeedMps,
        steer: steerToward(snapshot.ego.lateralOffsetM, snapshot, laneOriginal),
        emergencyBrake: false,
        aebActive: false,
        laneChangeEvent: null,
        takeoverReason: null,
      },
      event: null,
    };
  };

  return {
    get laneChangePhase(): LanePhase {
      return lanePhase;
    },

    reset(): void {
      lanePhase = 'idle';
      laneTarget = null;
      laneOriginal = 0;
      laneTimer = 0;
      cooldown = 0;
      slowLeadTimer = 0;
      lastLateral = null;
      pedestrianWaitS = DECISION.pedestrianClearWaitS;
    },

    update(snapshot: PerceptionSnapshot): DecisionOutput {
      const egoSpeed = snapshot.ego.speedMps;
      const baseSpeed = Math.min(policy.maxSpeedKmh, snapshot.lane.speedLimitKmh) / 3.6;
      const lateral = snapshot.ego.lateralOffsetM;

      let blocker: Blocker | null = null;
      if (snapshot.lead) {
        blocker = {
          id: snapshot.lead.id,
          gapM: snapshot.lead.distanceM,
          speedMps: Math.max(0, egoSpeed - snapshot.lead.relativeSpeedMps),
          kind: 'vehicle',
        };
      }
      for (const object of snapshot.objects) {
        if (!isStaticKind(object.kind)) {
          continue;
        }
        if (Math.abs(object.lateralM) >= snapshot.lane.widthM * 0.55) {
          continue;
        }
        const gap = object.forwardM - object.lengthM / 2 - EGO_LENGTH_M / 2;
        if (gap < 0) {
          continue;
        }
        if (!blocker || gap < blocker.gapM) {
          blocker = { id: object.id, gapM: gap, speedMps: 0, kind: 'static' };
        }
      }

      const aeb = evaluateAeb(
        blocker?.gapM ?? Number.POSITIVE_INFINITY,
        blocker ? egoSpeed - blocker.speedMps : 0,
        egoSpeed,
      );
      const aebActive = aeb.trigger;

      if (aebActive) {
        const event = abortLaneChange();
        lastLateral = lateral;
        return {
          state: snapshot.lead ? 'follow' : 'stop',
          reasonCode: 'aeb',
          targetSpeedMps: 0,
          steer: steerToward(lateral, snapshot, snapshot.ego.laneIndex),
          emergencyBrake: true,
          aebActive: true,
          laneChangeEvent: event,
          takeoverReason: null,
        };
      }

      // 行人：在人行横道/本车道前方时停车让行
      const stopLine = snapshot.lane.stopLineM;
      const pedestrian = snapshot.objects.find(
        (object) => object.kind === 'pedestrian' && object.forwardM > -2 && object.forwardM < 120,
      );
      if (pedestrian) {
        pedestrianWaitS = 0;
        const event = abortLaneChange();
        lastLateral = lateral;
        const pedestrianStopDistance = Math.max(0, pedestrian.forwardM - EGO_LENGTH_M / 2 - 6);
        const signalStopDistance =
          stopLine !== null && stopLine >= -0.5 && pedestrian.forwardM <= stopLine + 14
            ? Math.max(0, stopLine - EGO_LENGTH_M / 2 - DECISION.stopLineTargetM)
            : pedestrianStopDistance;
        const targetSpeedMps =
          pedestrian.forwardM < 12
            ? 0
            : stopLineTargetSpeed(
                stopLine !== null && stopLine >= -0.5 ? signalStopDistance : pedestrianStopDistance,
                baseSpeed,
              );
        return {
          state: pedestrian.forwardM > 35 ? 'decelerate' : 'yield',
          reasonCode: pedestrian.forwardM > 35 ? 'pedestrianAhead' : 'pedestrian',
          targetSpeedMps,
          steer: steerToward(lateral, snapshot, snapshot.ego.laneIndex),
          emergencyBrake: pedestrian.forwardM < 32 && egoSpeed > 5,
          aebActive: false,
          laneChangeEvent: event,
          takeoverReason: null,
        };
      }
      if (pedestrianWaitS < DECISION.pedestrianClearWaitS) {
        const distanceToLine = stopLine;
        if (distanceToLine !== null && distanceToLine > 12) {
          pedestrianWaitS = DECISION.pedestrianClearWaitS;
        } else {
          pedestrianWaitS = Math.min(DECISION.pedestrianClearWaitS, pedestrianWaitS + DECISION_DT);
          lastLateral = lateral;
          return {
            state: 'yield',
            reasonCode: 'pedestrianClear',
            targetSpeedMps: 0,
            steer: steerToward(lateral, snapshot, snapshot.ego.laneIndex),
            emergencyBrake: false,
            aebActive: false,
            laneChangeEvent: null,
            takeoverReason: null,
          };
        }
      }

      // 信号灯与停止线
      if (stopLine !== null && stopLine > -0.5 && snapshot.light.state !== 'none') {
        const stopDistance = Math.max(0, stopLine - DECISION.stopLineTargetM - EGO_LENGTH_M / 2);
        const mustStop =
          snapshot.light.state === 'red' ||
          (snapshot.light.state === 'yellow' &&
            egoSpeed * egoSpeed <= 2 * DECISION.comfortableBrakeMps2 * stopDistance);
        if (mustStop) {
          const event = abortLaneChange();
          lastLateral = lateral;
          return {
            state: stopLine > 35 ? 'decelerate' : 'stop',
            reasonCode:
              stopLine > 35
                ? snapshot.light.state === 'red'
                  ? 'redLightAhead'
                  : 'yellowLightAhead'
                : snapshot.light.state === 'red'
                  ? 'redLight'
                  : 'yellowLight',
            targetSpeedMps: stopDistance < 1.5 ? 0 : stopLineTargetSpeed(stopDistance, baseSpeed),
            steer: steerToward(lateral, snapshot, snapshot.ego.laneIndex),
            emergencyBrake: false,
            aebActive: false,
            laneChangeEvent: event,
            takeoverReason: null,
          };
        }
      }

      // 已进入的变道流程优先继续
      const laneResult = updateLaneChange(snapshot, baseSpeed);
      if (laneResult.output) {
        lastLateral = lateral;
        return laneResult.output;
      }

      let targetSpeed = baseSpeed;
      let state: DecisionState = 'cruise';
      let reasonCode = 'keepLane';
      let slowLead = false;

      if (blocker) {
        const leadSpeed = blocker.kind === 'vehicle' ? blocker.speedMps : 0;
        if (blocker.kind === 'vehicle') {
          targetSpeed = followTargetSpeed(
            blocker.gapM,
            egoSpeed,
            leadSpeed,
            policy.timeHeadwayS,
            baseSpeed,
          );
          slowLead = leadSpeed < baseSpeed - policy.laneChange.slowDeltaMps && blocker.gapM < 90;
        } else {
          targetSpeed = obstacleTargetSpeed(blocker.gapM, baseSpeed);
        }
        state = 'follow';
        reasonCode = 'followLead';
      }

      if (slowLead) {
        slowLeadTimer += DECISION_DT;
      } else {
        slowLeadTimer = 0;
      }

      // 变道需求：慢车持续阻挡，或本车道出现静止障碍
      const staticBlocked =
        blocker !== null &&
        blocker.kind === 'static' &&
        blocker.gapM < 120 &&
        !snapshot.lane.onCrosswalk &&
        (stopLine === null || stopLine > 30);
      const slowBlocked =
        slowLead &&
        slowLeadTimer >= policy.laneChange.holdS + policy.reactionTimeS &&
        (stopLine === null || stopLine > 30);
      if (
        (staticBlocked || slowBlocked) &&
        lanePhase === 'idle' &&
        cooldown <= 0 &&
        !snapshot.lane.onCrosswalk
      ) {
        const candidate = chooseLaneCandidate(snapshot, policy, EGO_LENGTH_M);
        if (candidate) {
          startLaneChange(candidate.laneIndex, snapshot);
          slowLeadTimer = 0;
          lastLateral = lateral;
          return {
            state: 'laneChange',
            reasonCode:
              candidate.laneIndex < snapshot.ego.laneIndex ? 'laneChangeLeft' : 'laneChangeRight',
            targetSpeedMps: baseSpeed,
            steer: steerToward(lateral, snapshot, candidate.laneIndex),
            emergencyBrake: false,
            aebActive: false,
            laneChangeEvent: 'started',
            takeoverReason: null,
          };
        }
        if (
          staticBlocked &&
          blocker !== null &&
          blocker.gapM < 55 &&
          egoSpeed > 5 &&
          (stopLine === null || stopLine > 10)
        ) {
          lastLateral = lateral;
          return {
            state: 'takeoverRequest',
            reasonCode: 'blockedLane',
            targetSpeedMps: 0,
            steer: steerToward(lateral, snapshot, snapshot.ego.laneIndex),
            emergencyBrake: false,
            aebActive: false,
            laneChangeEvent: null,
            takeoverReason: 'blockedLane',
          };
        }
      }

      // 预测不可避免碰撞：请求接管（TTC ≤ 3.5 s 且制动/变道无法避免）
      if (
        snapshot.lead &&
        snapshot.lead.ttcS !== null &&
        snapshot.lead.ttcS <= 3.5 &&
        aeb.requiredDecelMps2 > DECISION.aebRequiredDecelMps2 &&
        chooseLaneCandidate(snapshot, policy, EGO_LENGTH_M) === null
      ) {
        lastLateral = lateral;
        return {
          state: 'takeoverRequest',
          reasonCode: 'unavoidableCollision',
          targetSpeedMps: 0,
          steer: steerToward(lateral, snapshot, snapshot.ego.laneIndex),
          emergencyBrake: false,
          aebActive: false,
          laneChangeEvent: null,
          takeoverReason: 'unavoidableCollision',
        };
      }

      if (slowLead && reasonCode === 'followLead') {
        const hasWindow = chooseLaneCandidate(snapshot, policy, EGO_LENGTH_M) !== null;
        reasonCode = hasWindow ? 'leadSlower' : 'leadSlowerWait';
      }

      lastLateral = lateral;
      return {
        state,
        reasonCode,
        targetSpeedMps: targetSpeed,
        steer: steerToward(lateral, snapshot, snapshot.ego.laneIndex),
        emergencyBrake: false,
        aebActive: false,
        laneChangeEvent: null,
        takeoverReason: null,
      };
    },
  };
}
