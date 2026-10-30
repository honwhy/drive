export interface TakeoverRecord {
  readonly id: number;
  readonly startedAtS: number;
  endedAtS: number | null;
  readonly reasonCode: string;
  readonly requestedBySystem: boolean;
}

/** 一局遥测：全部为模拟状态累计，评分函数只读。 */
export interface Telemetry {
  distanceM: number;
  durationS: number;
  maxSpeedKmh: number;
  collisions: number;
  collisionReason: string | null;
  hardBrakes: number;
  hardAccels: number;
  sharpTurns: number;
  aebCount: number;
  takeoverCount: number;
  takeoverDurationS: number;
  systemTakeoverCount: number;
  takeoverReasons: string[];
  takeoverEvents: TakeoverRecord[];
  tailgatingEvents: number;
  minTimeGapS: number | null;
  followTimeS: number;
  safeGapTimeS: number;
  laneChangeAttempts: number;
  laneChangeSuccess: number;
  laneChangeAborts: number;
  illegalLaneChanges: number;
  unnecessaryLaneChanges: number;
  redLightViolations: number;
  noYield: number;
  missedGreen: number;
  stoppedWithoutReason: number;
  speedingEvents: number;
  laneDepartures: number;
  safeStop: boolean;
  tutorialCompleted: boolean;
  tutorialSkipped: boolean;
  eventsCovered: string[];
}

export function createTelemetry(): Telemetry {
  return {
    distanceM: 0,
    durationS: 0,
    maxSpeedKmh: 0,
    collisions: 0,
    collisionReason: null,
    hardBrakes: 0,
    hardAccels: 0,
    sharpTurns: 0,
    aebCount: 0,
    takeoverCount: 0,
    takeoverDurationS: 0,
    systemTakeoverCount: 0,
    takeoverReasons: [],
    takeoverEvents: [],
    tailgatingEvents: 0,
    minTimeGapS: null,
    followTimeS: 0,
    safeGapTimeS: 0,
    laneChangeAttempts: 0,
    laneChangeSuccess: 0,
    laneChangeAborts: 0,
    illegalLaneChanges: 0,
    unnecessaryLaneChanges: 0,
    redLightViolations: 0,
    noYield: 0,
    missedGreen: 0,
    stoppedWithoutReason: 0,
    speedingEvents: 0,
    laneDepartures: 0,
    safeStop: false,
    tutorialCompleted: false,
    tutorialSkipped: false,
    eventsCovered: [],
  };
}

export function averageSpeedKmh(telemetry: Telemetry): number {
  if (telemetry.durationS <= 0) {
    return 0;
  }
  return (telemetry.distanceM / telemetry.durationS) * 3.6;
}

export function safeGapRatio(telemetry: Telemetry): number | null {
  if (telemetry.followTimeS < 1) {
    return null;
  }
  return telemetry.safeGapTimeS / telemetry.followTimeS;
}
