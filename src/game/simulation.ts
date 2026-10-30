import { DECISION, RISK, SCORING, SIMULATION, VEHICLE } from '../config/balance';
import type { PolicyConfig } from '../config/policies';
import type {
  DriveMode,
  EgoState,
  EntityState,
  PerceptionSnapshot,
  VehicleInput,
} from '../types/game';
import { speedControl } from './control';
import { curveOffset, generateScenario, type ScenarioConfig, type SignalSpec } from './scenario';
import { createEgoState, laneCenter, roadHalfWidth } from './vehicle';
import { stepVehicle } from './vehicle';
import { sense, type SignalState } from './perception';
import { createDecisionMachine, type DecisionOutput } from './decision/machine';
import { createTelemetry, type Telemetry } from './telemetry';
import { obbFromCenter, obbOverlap } from './geometry';

export type SimFinishReason = 'arrived' | 'collision' | 'safeStop';

export type SimEventType =
  | 'aeb'
  | 'collision'
  | 'laneChangeStart'
  | 'laneChangeComplete'
  | 'laneChangeAbort'
  | 'takeoverRequest'
  | 'takeoverTimeout'
  | 'resumeRefused'
  | 'redLight'
  | 'noYield'
  | 'speeding'
  | 'tailgating'
  | 'laneDeparture';

export interface SimEvent {
  readonly type: SimEventType;
  readonly reason?: string;
}

export interface SimulationSnapshot {
  readonly timeS: number;
  readonly ego: EgoState;
  readonly entities: readonly EntityState[];
  readonly signals: readonly SignalState[];
  readonly crosswalks: readonly number[];
  readonly scenario: ScenarioConfig;
  readonly perception: PerceptionSnapshot | null;
  readonly decision: DecisionOutput | null;
  readonly mode: DriveMode;
  readonly takeoverRemainingS: number | null;
  readonly takeoverReason: string | null;
  readonly braking: boolean;
  readonly steering: number;
  readonly finished: boolean;
  readonly finishReason: SimFinishReason | null;
}

export type SimControl = 'left' | 'right' | 'accelerate' | 'brake';

export interface Simulation {
  step(dt: number): void;
  snapshot(): SimulationSnapshot;
  setManual(manual: boolean): void;
  requestResumeAuto(): { readonly ok: boolean; readonly reason: string | null };
  setControl(action: SimControl, active: boolean): void;
  setTutorialResult(completed: boolean, skipped: boolean): void;
  drainEvents(): readonly SimEvent[];
  reset(): void;
  readonly telemetry: Telemetry;
  readonly scenario: ScenarioConfig;
  readonly finished: boolean;
  readonly finishReason: SimFinishReason | null;
}

interface SimEntity {
  id: string;
  kind: EntityState['kind'];
  lane: number;
  s: number;
  lateralM: number;
  speedMps: number;
  targetSpeedMps: number;
  lengthM: number;
  widthM: number;
  body: EntityState['body'];
  speedChanges: readonly { atS: number; speedMps: number }[];
  changeIndex: number;
  brakeAtS: readonly number[];
  brakeIndex: number;
  brakeTimer: number;
  cutInAtS: number | null;
  cutInLane: number | null;
  cutInStartLateral: number;
  cutInTimer: number;
  crossingDir: -1 | 0 | 1;
  crossSpeedMps: number;
  walkAtS: number;
  crossing: boolean;
}

interface SimSignal extends SignalSpec {
  state: SignalState['state'];
  remainingS: number | null;
}

const EGO_WIDTH_M = 1.9;
const EGO_LENGTH_M = 4.8;
const SIGNAL_CYCLE_S = 25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function signalState(spec: SignalSpec, timeS: number): SimSignal {
  const phase = (((timeS + spec.offsetS) % SIGNAL_CYCLE_S) + SIGNAL_CYCLE_S) % SIGNAL_CYCLE_S;
  if (phase < 12) {
    return { ...spec, state: 'green', remainingS: 12 - phase };
  }
  if (phase < 16) {
    return { ...spec, state: 'yellow', remainingS: 16 - phase };
  }
  return { ...spec, state: 'red', remainingS: SIGNAL_CYCLE_S - phase };
}

function collisionReason(entity: EntityState, ego: { s: number }): string {
  switch (entity.kind) {
    case 'pedestrian':
      return '撞到行人';
    case 'construction':
      return '撞上施工设施';
    case 'obstacle':
      return '撞上障碍物';
    default:
      return entity.s < ego.s - 0.1 ? '被后车追尾' : '追尾前车';
  }
}

export function createSimulation(options: {
  readonly levelId: number;
  readonly policy: PolicyConfig;
  readonly seed: number;
  /** 测试或预览可注入固定场景；正常游戏使用生成的场景 */
  readonly scenario?: ScenarioConfig;
}): Simulation {
  const scenario = options.scenario ?? generateScenario(options.levelId, options.seed);
  const policy = options.policy;
  const laneCount = scenario.laneCount;
  const laneWidth = scenario.laneWidthM;
  const halfRoad = roadHalfWidth(laneCount, laneWidth);
  const startLane = laneCount === 2 ? 0 : 1;
  const machine = createDecisionMachine(policy);
  const telemetry = createTelemetry();
  const events: SimEvent[] = [];

  let ego: EgoState;
  let entities: SimEntity[] = [];
  let signals: SimSignal[] = [];
  let timeS = 0;
  let decisionAccumulator = 0;
  let decisionTick = 0;
  let perception: PerceptionSnapshot | null = null;
  let decision: DecisionOutput | null = null;
  let mode: DriveMode = scenario.manual ? 'manual' : 'auto';
  let takeoverRemaining: number | null = null;
  let takeoverReason: string | null = null;
  let timeoutStop = false;
  let finished = false;
  let finishReason: SimFinishReason | null = null;
  let previousS = 0;
  let previousLateralVel = 0;
  let input: VehicleInput = { throttle: 0, brake: 0, steer: 0, emergency: false };
  let manualLeft = false;
  let manualRight = false;
  let manualAccel = false;
  let manualBrake = false;
  let steerDir = 0;
  let aebPrevious = false;
  let hardBrakeTimer = 0;
  let hardBrakeFlag = false;
  let hardAccelTimer = 0;
  let hardAccelFlag = false;
  let sharpTurnCooldown = 0;
  let tailgateTimer = 0;
  let tailgateFlag = false;
  let speedTimer = 0;
  let speedFlag = false;
  let departureTimer = 0;
  let departureFlag = false;
  let latestSignalStates: SimSignal[] = [];
  let committedSignals = new Set<string>();

  const emit = (event: SimEvent): void => {
    events.push(event);
    if (events.length > 30) {
      events.shift();
    }
  };

  const closeTakeoverRecord = (): void => {
    const last = telemetry.takeoverEvents[telemetry.takeoverEvents.length - 1];
    if (last && last.endedAtS === null) {
      telemetry.takeoverEvents[telemetry.takeoverEvents.length - 1] = {
        ...last,
        endedAtS: timeS,
      };
    }
  };

  const init = (): void => {
    ego = createEgoState(scenario.startSpeedKmh / 3.6, startLane, laneCount, laneWidth);
    entities = [];
    for (const spec of scenario.vehicles) {
      entities.push({
        id: spec.id,
        kind: 'vehicle',
        lane: spec.lane,
        s: spec.s,
        lateralM: spec.lateralM ?? laneCenter(spec.lane, laneCount, laneWidth),
        speedMps: spec.speedMps,
        targetSpeedMps: spec.targetSpeedMps,
        lengthM: spec.lengthM,
        widthM: spec.widthM,
        body: spec.body,
        speedChanges: spec.speedChanges,
        changeIndex: 0,
        brakeAtS: spec.brakeAtS,
        brakeIndex: 0,
        brakeTimer: 0,
        cutInAtS: spec.cutInAtS,
        cutInLane: spec.cutInLane,
        cutInStartLateral: spec.lateralM ?? laneCenter(spec.lane, laneCount, laneWidth),
        cutInTimer: -1,
        crossingDir: spec.crossingDir,
        crossSpeedMps: spec.crossSpeedMps,
        walkAtS: 0,
        crossing: false,
      });
    }
    for (const spec of scenario.statics) {
      const lateral =
        spec.lateralM ??
        (spec.lane < 0 ? halfRoad + 1.5 : laneCenter(spec.lane, laneCount, laneWidth));
      entities.push({
        id: spec.id,
        kind: spec.kind,
        lane: spec.lane,
        s: spec.s,
        lateralM: lateral,
        speedMps: 0,
        targetSpeedMps: 0,
        lengthM: spec.lengthM,
        widthM: spec.widthM,
        body: 'sedan',
        speedChanges: [],
        changeIndex: 0,
        brakeAtS: [],
        brakeIndex: 0,
        brakeTimer: 0,
        cutInAtS: null,
        cutInLane: null,
        cutInStartLateral: lateral,
        cutInTimer: -1,
        crossingDir: 0,
        crossSpeedMps: 0,
        walkAtS: 0,
        crossing: false,
      });
    }
    for (const spec of scenario.pedestrians) {
      entities.push({
        id: spec.id,
        kind: 'pedestrian',
        lane: -1,
        s: spec.s,
        lateralM: spec.startLateralM,
        speedMps: spec.speedMps,
        targetSpeedMps: spec.speedMps,
        lengthM: 0.6,
        widthM: 0.5,
        body: 'sedan',
        speedChanges: [],
        changeIndex: 0,
        brakeAtS: [],
        brakeIndex: 0,
        brakeTimer: 0,
        cutInAtS: null,
        cutInLane: null,
        cutInStartLateral: spec.startLateralM,
        cutInTimer: -1,
        crossingDir: spec.direction,
        crossSpeedMps: 0,
        walkAtS: spec.walkAtS,
        crossing: false,
      });
    }

    signals = scenario.signals.map((spec) => signalState(spec, 0));
    latestSignalStates = signals;
    committedSignals = new Set();
    timeS = 0;
    decisionAccumulator = 0;
    decisionTick = 0;
    perception = null;
    decision = null;
    mode = scenario.manual ? 'manual' : 'auto';
    takeoverRemaining = null;
    takeoverReason = null;
    timeoutStop = false;
    finished = false;
    finishReason = null;
    previousS = 0;
    previousLateralVel = 0;
    input = { throttle: 0, brake: 0, steer: 0, emergency: false };
    manualLeft = false;
    manualRight = false;
    manualAccel = false;
    manualBrake = false;
    steerDir = 0;
    aebPrevious = false;
    hardBrakeTimer = 0;
    hardBrakeFlag = false;
    hardAccelTimer = 0;
    hardAccelFlag = false;
    sharpTurnCooldown = 0;
    tailgateTimer = 0;
    tailgateFlag = false;
    speedTimer = 0;
    speedFlag = false;
    departureTimer = 0;
    departureFlag = false;
    machine.reset();
    telemetry.distanceM = 0;
    telemetry.durationS = 0;
    telemetry.maxSpeedKmh = 0;
    telemetry.collisions = 0;
    telemetry.collisionReason = null;
    telemetry.hardBrakes = 0;
    telemetry.hardAccels = 0;
    telemetry.sharpTurns = 0;
    telemetry.aebCount = 0;
    telemetry.takeoverCount = 0;
    telemetry.takeoverDurationS = 0;
    telemetry.systemTakeoverCount = 0;
    telemetry.takeoverReasons = [];
    telemetry.takeoverEvents = [];
    telemetry.tailgatingEvents = 0;
    telemetry.minTimeGapS = null;
    telemetry.followTimeS = 0;
    telemetry.safeGapTimeS = 0;
    telemetry.laneChangeAttempts = 0;
    telemetry.laneChangeSuccess = 0;
    telemetry.laneChangeAborts = 0;
    telemetry.illegalLaneChanges = 0;
    telemetry.unnecessaryLaneChanges = 0;
    telemetry.redLightViolations = 0;
    telemetry.noYield = 0;
    telemetry.missedGreen = 0;
    telemetry.stoppedWithoutReason = 0;
    telemetry.speedingEvents = 0;
    telemetry.laneDepartures = 0;
    telemetry.safeStop = false;
    telemetry.eventsCovered = [...new Set(scenario.events.map((event) => event.type))];
    events.length = 0;
  };

  const toEntityState = (entity: SimEntity): EntityState => ({
    id: entity.id,
    kind: entity.kind,
    lane: entity.lane,
    s: entity.s,
    lateralM: entity.lateralM,
    speedMps: entity.speedMps,
    lengthM: entity.lengthM,
    widthM: entity.widthM,
    body: entity.body,
    crossingDir: entity.crossingDir,
  });

  const speedLimitForAuto = (): number => {
    const limit = Math.min(policy.maxSpeedKmh, scenario.speedLimitKmh) / 3.6;
    if (scenario.curve) {
      return Math.min(limit, 70 / 3.6);
    }
    return limit;
  };

  const updateEntities = (dt: number): void => {
    for (const entity of entities) {
      if (entity.kind === 'vehicle') {
        if (entity.crossingDir !== 0) {
          const signal = scenario.signals.find((spec) => Math.abs(entity.s - (spec.s + 6)) < 3);
          const current = signal
            ? latestSignalStates.find((state) => state.id === signal.id)
            : undefined;
          const limit = halfRoad + 6;
          if (!entity.crossing) {
            if (current?.state === 'red') {
              if (entity.crossingDir > 0 && entity.lateralM > limit - 0.5) {
                entity.lateralM = -limit;
              } else if (entity.crossingDir < 0 && entity.lateralM < -limit + 0.5) {
                entity.lateralM = limit;
              }
              entity.crossing = true;
            }
          } else {
            entity.lateralM += entity.crossingDir * entity.crossSpeedMps * dt;
            if (Math.abs(entity.lateralM) > limit) {
              entity.lateralM = entity.crossingDir * limit;
              entity.crossing = false;
            }
          }
          continue;
        }
        while (
          entity.changeIndex < entity.speedChanges.length &&
          entity.s >= (entity.speedChanges[entity.changeIndex]?.atS ?? Number.POSITIVE_INFINITY)
        ) {
          entity.targetSpeedMps =
            entity.speedChanges[entity.changeIndex]?.speedMps ?? entity.targetSpeedMps;
          entity.changeIndex += 1;
        }
        while (
          entity.brakeIndex < entity.brakeAtS.length &&
          entity.s >= (entity.brakeAtS[entity.brakeIndex] ?? Number.POSITIVE_INFINITY)
        ) {
          entity.brakeTimer = 1.8;
          entity.brakeIndex += 1;
        }
        if (entity.brakeTimer > 0) {
          entity.brakeTimer -= dt;
          entity.speedMps = Math.max(0, entity.speedMps - 6 * dt);
        } else {
          const delta = entity.targetSpeedMps - entity.speedMps;
          const rate = delta > 0 ? 1.5 : 3;
          entity.speedMps += clamp(delta, -rate * dt, rate * dt);
        }

        if (
          entity.cutInAtS !== null &&
          entity.cutInLane !== null &&
          entity.cutInTimer < 0 &&
          ego.s >= entity.cutInAtS - 45
        ) {
          entity.cutInTimer = 0;
          entity.cutInStartLateral = entity.lateralM;
        }
        if (entity.cutInTimer >= 0 && entity.cutInLane !== null) {
          entity.cutInTimer += dt;
          const target = laneCenter(entity.cutInLane, laneCount, laneWidth);
          const t = Math.min(1, entity.cutInTimer / 3);
          entity.lateralM = entity.cutInStartLateral + (target - entity.cutInStartLateral) * t;
          if (t >= 1) {
            entity.lane = entity.cutInLane;
            entity.cutInTimer = -1;
          }
        }
        entity.s += entity.speedMps * dt;

        // 同车道后车跟驰：避免后车直接穿过停在路口/让行中的本车
        if (entity.lane === ego.laneIndex && entity.s < ego.s - 0.1) {
          const gap = ego.s - entity.s - (entity.lengthM + EGO_LENGTH_M) / 2;
          if (gap < 50) {
            const desired = gap <= 8 ? 0 : (gap - 8) * 0.5;
            if (entity.speedMps > desired) {
              entity.speedMps = Math.max(0, entity.speedMps - 4 * dt);
            }
          }
        }
      } else if (entity.kind === 'pedestrian') {
        if (!entity.crossing && ego.s >= entity.walkAtS) {
          entity.crossing = true;
        }
        if (entity.crossing) {
          entity.lateralM += entity.crossingDir * entity.speedMps * dt;
        }
      }
    }
  };

  const collisionCheck = (): void => {
    const egoObb = obbFromCenter(
      ego.lateralM + curveOffset(scenario.curve, ego.s),
      ego.s,
      EGO_WIDTH_M,
      EGO_LENGTH_M,
      ego.heading,
    );
    for (const entity of entities) {
      if (entity.kind === 'pedestrian' && !entity.crossing) {
        continue;
      }
      const entityObb = obbFromCenter(
        entity.lateralM + curveOffset(scenario.curve, entity.s),
        entity.s,
        entity.widthM,
        entity.lengthM,
        0,
      );
      if (obbOverlap(egoObb, entityObb)) {
        telemetry.collisions = 1;
        telemetry.collisionReason = collisionReason(entity, ego);
        finished = true;
        finishReason = 'collision';
        emit({ type: 'collision', reason: telemetry.collisionReason });
        return;
      }
    }
    if (Math.abs(ego.lateralM) + EGO_WIDTH_M / 2 > halfRoad) {
      telemetry.collisions = 1;
      telemetry.collisionReason = '驶出道路';
      finished = true;
      finishReason = 'collision';
      emit({ type: 'collision', reason: telemetry.collisionReason });
    }
  };

  const updateSignals = (): void => {
    latestSignalStates = scenario.signals.map((spec) => signalState(spec, timeS));
    signals = latestSignalStates;
  };

  const updateSignalCommitment = (before: readonly SimSignal[]): void => {
    for (const current of latestSignalStates) {
      const previous = before.find((signal) => signal.id === current.id);
      if (!previous) {
        continue;
      }
      if (current.state === 'green') {
        committedSignals.delete(current.id);
        continue;
      }
      if (previous.state === current.state) {
        continue;
      }
      const distance = current.s - ego.s;
      if (distance >= 0 && distance < (ego.speedMps * ego.speedMps) / 6 + 15) {
        committedSignals.add(current.id);
      }
    }
  };

  const handleDecisionEvents = (output: DecisionOutput): void => {
    if (output.laneChangeEvent === 'started') {
      telemetry.laneChangeAttempts += 1;
      emit({ type: 'laneChangeStart' });
    } else if (output.laneChangeEvent === 'completed') {
      telemetry.laneChangeSuccess += 1;
      emit({ type: 'laneChangeComplete' });
    } else if (output.laneChangeEvent === 'aborted') {
      telemetry.laneChangeAborts += 1;
      emit({ type: 'laneChangeAbort' });
    }
    if (output.aebActive && !aebPrevious) {
      telemetry.aebCount += 1;
      emit({ type: 'aeb' });
    }
    aebPrevious = output.aebActive;

    if (output.state === 'takeoverRequest' && mode === 'auto' && output.takeoverReason) {
      mode = 'takeoverRequest';
      takeoverRemaining = DECISION.takeoverCountdownS;
      takeoverReason = output.takeoverReason;
      emit({ type: 'takeoverRequest', reason: output.takeoverReason });
    }
  };

  const updateTelemetry = (dt: number): void => {
    telemetry.durationS += dt;
    telemetry.distanceM = ego.s;
    telemetry.maxSpeedKmh = Math.max(telemetry.maxSpeedKmh, ego.speedMps * 3.6);

    if (mode === 'manual') {
      telemetry.takeoverDurationS += dt;
    }

    if (ego.accelMps2 <= SCORING.hardBrakeMps2 && !decision?.aebActive) {
      hardBrakeTimer += dt;
      if (hardBrakeTimer >= SCORING.hardBrakeHoldS && !hardBrakeFlag) {
        telemetry.hardBrakes += 1;
        hardBrakeFlag = true;
      }
    } else {
      hardBrakeTimer = 0;
      if (ego.accelMps2 > -0.5) {
        hardBrakeFlag = false;
      }
    }

    if (ego.accelMps2 >= SCORING.hardAccelMps2) {
      hardAccelTimer += dt;
      if (hardAccelTimer >= SCORING.hardAccelHoldS && !hardAccelFlag) {
        telemetry.hardAccels += 1;
        hardAccelFlag = true;
      }
    } else {
      hardAccelTimer = 0;
      if (ego.accelMps2 < 1.5) {
        hardAccelFlag = false;
      }
    }

    const lateralAccel = Math.abs((ego.lateralVelMps - previousLateralVel) / Math.max(dt, 1e-6));
    previousLateralVel = ego.lateralVelMps;
    sharpTurnCooldown = Math.max(0, sharpTurnCooldown - dt);
    if (lateralAccel >= SCORING.sharpTurnMps2 && sharpTurnCooldown <= 0) {
      telemetry.sharpTurns += 1;
      sharpTurnCooldown = 1;
    }

    const lead = perception?.lead;
    if (lead && ego.speedMps >= 1) {
      const gapS = lead.distanceM / ego.speedMps;
      telemetry.followTimeS += dt;
      if (gapS >= 1) {
        telemetry.safeGapTimeS += dt;
      }
      telemetry.minTimeGapS =
        telemetry.minTimeGapS === null ? gapS : Math.min(telemetry.minTimeGapS, gapS);
      if (gapS < RISK.tailgatingGapS) {
        tailgateTimer += dt;
        if (tailgateTimer >= RISK.tailgatingHoldS && !tailgateFlag) {
          telemetry.tailgatingEvents += 1;
          tailgateFlag = true;
          emit({ type: 'tailgating' });
        }
      } else if (gapS > 0.9) {
        tailgateTimer = 0;
        tailgateFlag = false;
      }
    } else {
      tailgateTimer = 0;
      tailgateFlag = false;
    }

    if (ego.speedMps > scenario.speedLimitKmh / 3.6 + SCORING.speedingOverKmh / 3.6) {
      speedTimer += dt;
      if (speedTimer >= SCORING.speedingHoldS && !speedFlag) {
        telemetry.speedingEvents += 1;
        speedFlag = true;
        emit({ type: 'speeding' });
      }
    } else if (ego.speedMps < scenario.speedLimitKmh / 3.6 + 5 / 3.6) {
      speedTimer = 0;
      speedFlag = false;
    }

    const centered = Math.abs(ego.lateralM - laneCenter(ego.laneIndex, laneCount, laneWidth));
    if (
      mode === 'auto' &&
      machine.laneChangePhase === 'idle' &&
      centered > SCORING.laneDepartureM
    ) {
      departureTimer += dt;
      if (departureTimer > SCORING.laneDepartureHoldS && !departureFlag) {
        telemetry.laneDepartures += 1;
        departureFlag = true;
        emit({ type: 'laneDeparture' });
      }
    } else if (centered < 0.3) {
      departureTimer = 0;
      departureFlag = false;
    }

    for (const signal of latestSignalStates) {
      if (previousS < signal.s && ego.s >= signal.s && signal.state === 'red') {
        if (!committedSignals.has(signal.id)) {
          telemetry.redLightViolations += 1;
          emit({ type: 'redLight' });
        }
        committedSignals.delete(signal.id);
      }
    }

    for (const entity of entities) {
      if (
        entity.kind === 'pedestrian' &&
        entity.crossing &&
        previousS < entity.s &&
        ego.s >= entity.s &&
        Math.abs(ego.lateralM - entity.lateralM) < 1.4
      ) {
        telemetry.noYield += 1;
        emit({ type: 'noYield' });
      }
    }
  };

  const checkArrival = (): void => {
    if (ego.s >= scenario.lengthM) {
      finished = true;
      finishReason = 'arrived';
    }
  };

  const step = (dt: number): void => {
    if (finished) {
      return;
    }
    previousS = ego.s;

    if (!timeoutStop) {
      decisionAccumulator += dt;
      if (decisionAccumulator >= 1 / SIMULATION.decisionHz) {
        decisionAccumulator = 0;
        decisionTick += 1;
        perception = sense(
          {
            ego,
            egoWidthM: EGO_WIDTH_M,
            egoLengthM: EGO_LENGTH_M,
            entities: entities.map(toEntityState),
            laneCount,
            laneWidthM: laneWidth,
            speedLimitKmh: speedLimitForAuto() * 3.6,
            signals: latestSignalStates,
            crosswalks: scenario.crosswalks,
          },
          decisionTick,
        );
        if (mode !== 'manual') {
          decision = machine.update(perception);
          handleDecisionEvents(decision);
        }
      }
    }

    if (timeoutStop) {
      input = { throttle: 0, brake: 1, steer: 0, emergency: true };
    } else if (mode === 'manual') {
      const steer = steerDir;
      input = {
        throttle: manualAccel ? 1 : 0,
        brake: manualBrake ? 1 : 0,
        steer,
        emergency: false,
      };
    } else {
      if (mode === 'takeoverRequest') {
        if (takeoverRemaining !== null && takeoverRemaining > 0) {
          takeoverRemaining -= dt;
          if (takeoverRemaining <= 0) {
            takeoverRemaining = 0;
            timeoutStop = true;
            emit({ type: 'takeoverTimeout' });
          }
        }
        input = { throttle: 0, brake: 1, steer: 0, emergency: false };
      } else if (decision) {
        const control = speedControl(
          ego.speedMps,
          Math.min(decision.targetSpeedMps, speedLimitForAuto()),
          decision.emergencyBrake,
        );
        input = {
          ...control,
          throttle: Math.min(control.throttle, 0.8),
          steer: decision.steer,
        };

        // 停止线速度包络：按 2.0 m/s² 的规划减速度提前制动，避免高速冲过停止线
        if (decision.state === 'stop' || decision.state === 'yield') {
          const stopLine = perception?.lane.stopLineM;
          if (stopLine !== null && stopLine !== undefined && stopLine > 0) {
            const available = stopLine - 3.4;
            const allowed = Math.sqrt(2 * 2 * Math.max(0, available));
            if (available > 0 && ego.speedMps > allowed) {
              input = {
                throttle: 0,
                brake: 0.75,
                steer: decision.steer,
                emergency: false,
              };
            }
            if (stopLine < 4.5 && stopLine > -0.5 && ego.speedMps > 0.5) {
              input = {
                throttle: 0,
                brake: 1,
                steer: decision.steer,
                emergency: true,
              };
            }
          }
        }
      } else {
        const control = speedControl(ego.speedMps, speedLimitForAuto());
        input = { ...control, throttle: Math.min(control.throttle, 0.8) };
      }
    }

    const limit =
      mode === 'manual'
        ? VEHICLE.maxManualSpeedKmh / 3.6
        : Math.min(VEHICLE.maxManualSpeedKmh / 3.6, speedLimitForAuto());

    ego = stepVehicle(ego, input, dt, limit, laneCount, laneWidth);
    timeS += dt;
    const previousSignals = latestSignalStates;
    updateSignals();
    updateSignalCommitment(previousSignals);
    updateEntities(dt);
    collisionCheck();
    if (!finished) {
      updateTelemetry(dt);
      checkArrival();
    } else {
      updateTelemetry(dt);
    }

    if (timeoutStop && !finished) {
      if (ego.speedMps <= 0.05) {
        finished = true;
        finishReason = 'safeStop';
        telemetry.safeStop = true;
      }
    }

    if (finished) {
      closeTakeoverRecord();
    }
  };

  const snapshot = (): SimulationSnapshot => ({
    timeS,
    ego,
    entities: entities.map(toEntityState),
    signals: latestSignalStates,
    crosswalks: scenario.crosswalks,
    scenario,
    perception,
    decision,
    mode,
    takeoverRemainingS: mode === 'takeoverRequest' ? takeoverRemaining : null,
    takeoverReason: mode === 'takeoverRequest' ? takeoverReason : null,
    braking: input.brake > 0.1,
    steering: input.steer,
    finished,
    finishReason,
  });

  const setManual = (manual: boolean): void => {
    if (manual) {
      if (finished || mode === 'manual' || timeoutStop) {
        return;
      }
      const fromRequest = mode === 'takeoverRequest';
      mode = 'manual';
      takeoverRemaining = null;
      takeoverReason = fromRequest ? takeoverReason : null;
      timeoutStop = false;
      manualLeft = false;
      manualRight = false;
      manualAccel = false;
      manualBrake = false;
      steerDir = 0;
      telemetry.takeoverCount += 1;
      if (fromRequest) {
        telemetry.systemTakeoverCount += 1;
      }
      telemetry.takeoverReasons.push(fromRequest ? 'systemRequest' : 'activeTakeover');
      telemetry.takeoverEvents.push({
        id: telemetry.takeoverEvents.length + 1,
        startedAtS: timeS,
        endedAtS: null,
        reasonCode: fromRequest ? (takeoverReason ?? 'unavoidableCollision') : 'activeTakeover',
        requestedBySystem: fromRequest,
      });
      machine.reset();
    } else if (mode === 'manual') {
      closeTakeoverRecord();
      mode = 'auto';
      decision = null;
      perception = null;
      decisionAccumulator = 0;
      machine.reset();
    }
  };

  const requestResumeAuto = (): { ok: boolean; reason: string | null } => {
    if (mode !== 'manual') {
      return { ok: false, reason: 'notManual' };
    }
    if (!perception) {
      return { ok: false, reason: 'noPerception' };
    }
    const targetGap = Math.max(5, ego.speedMps * policy.timeHeadwayS);
    const leadGap = perception.lead?.distanceM ?? Number.POSITIVE_INFINITY;
    if (leadGap < targetGap * DECISION.resumeGapFactor) {
      return { ok: false, reason: 'gapTooSmall' };
    }
    if (perception.risk === 'warning' || perception.risk === 'danger') {
      return { ok: false, reason: 'riskTooHigh' };
    }
    if (
      perception.lane.onCrosswalk ||
      (perception.lane.stopLineM !== null && perception.lane.stopLineM < 30)
    ) {
      return { ok: false, reason: 'nearIntersection' };
    }
    if (machine.laneChangePhase !== 'idle') {
      return { ok: false, reason: 'laneChanging' };
    }
    setManual(false);
    return { ok: true, reason: null };
  };

  const setControl = (action: SimControl, active: boolean): void => {
    if (action === 'left') {
      manualLeft = active;
      if (active) {
        steerDir = -1;
      } else if (steerDir === -1) {
        steerDir = manualRight ? 1 : 0;
      }
    } else if (action === 'right') {
      manualRight = active;
      if (active) {
        steerDir = 1;
      } else if (steerDir === 1) {
        steerDir = manualLeft ? -1 : 0;
      }
    } else if (action === 'accelerate') {
      manualAccel = active;
    } else {
      manualBrake = active;
    }
  };

  init();

  return {
    step,
    snapshot,
    setManual,
    requestResumeAuto,
    setControl,
    setTutorialResult(completed: boolean, skipped: boolean): void {
      telemetry.tutorialCompleted = completed;
      telemetry.tutorialSkipped = skipped;
    },
    drainEvents(): readonly SimEvent[] {
      const copy = [...events];
      events.length = 0;
      return copy;
    },
    reset(): void {
      init();
    },
    get telemetry(): Telemetry {
      return telemetry;
    },
    get scenario(): ScenarioConfig {
      return scenario;
    },
    get finished(): boolean {
      return finished;
    },
    get finishReason(): SimFinishReason | null {
      return finishReason;
    },
  };
}
