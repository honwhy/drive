import { createRng, type Rng } from '../core/rng';
import { getLevel, type LevelConfig } from '../config/levels';

export interface CurveConfig {
  readonly amplitudeM: number;
  readonly wavelengthM: number;
}

export interface SignalSpec {
  readonly id: string;
  /** 停止线位置 */
  readonly s: number;
  /** 信号周期偏移（秒） */
  readonly offsetS: number;
}

export interface SpeedChange {
  readonly atS: number;
  readonly speedMps: number;
}

export interface VehicleSpec {
  readonly id: string;
  readonly lane: number;
  readonly s: number;
  readonly speedMps: number;
  readonly targetSpeedMps: number;
  readonly lengthM: number;
  readonly widthM: number;
  readonly body: 'sedan' | 'suv' | 'truck';
  readonly speedChanges: readonly SpeedChange[];
  readonly brakeAtS: readonly number[];
  readonly cutInAtS: number | null;
  readonly cutInLane: number | null;
  readonly crossingDir: -1 | 0 | 1;
  readonly crossSpeedMps: number;
  readonly lateralM: number | null;
}

export interface StaticSpec {
  readonly id: string;
  readonly kind: 'obstacle' | 'construction';
  readonly lane: number;
  readonly s: number;
  readonly lateralM: number | null;
  readonly lengthM: number;
  readonly widthM: number;
}

export interface PedestrianSpec {
  readonly id: string;
  /** 人行横道位置 */
  readonly s: number;
  readonly startLateralM: number;
  readonly direction: -1 | 1;
  /** 本车到达该位置附近时开始横穿 */
  readonly walkAtS: number;
  readonly speedMps: number;
}

export type ScenarioEventType =
  'leadBrake' | 'pedestrian' | 'cutIn' | 'construction' | 'signal' | 'curve';

export interface ScenarioEvent {
  readonly type: ScenarioEventType;
  readonly s: number;
  readonly lane: number;
}

export interface ScenarioConfig {
  readonly levelId: number;
  readonly seed: number;
  readonly lengthM: number;
  readonly laneCount: number;
  readonly laneWidthM: number;
  readonly speedLimitKmh: number;
  readonly startSpeedKmh: number;
  readonly manual: boolean;
  readonly curve: CurveConfig | null;
  readonly signals: readonly SignalSpec[];
  readonly crosswalks: readonly number[];
  readonly vehicles: readonly VehicleSpec[];
  readonly statics: readonly StaticSpec[];
  readonly pedestrians: readonly PedestrianSpec[];
  readonly events: readonly ScenarioEvent[];
}

const LANE_WIDTH_M = 3.5;

function vehicle(
  id: string,
  lane: number,
  s: number,
  speedKmh: number,
  options: Partial<Omit<VehicleSpec, 'id' | 'lane' | 's' | 'speedMps'>> = {},
): VehicleSpec {
  const speedMps = speedKmh / 3.6;
  return {
    id,
    lane,
    s,
    speedMps,
    targetSpeedMps: speedMps,
    lengthM: 4.6,
    widthM: 1.9,
    body: 'sedan',
    speedChanges: [],
    brakeAtS: [],
    cutInAtS: null,
    cutInLane: null,
    crossingDir: 0,
    crossSpeedMps: 0,
    lateralM: null,
    ...options,
  };
}

function staticObstacle(
  id: string,
  lane: number,
  s: number,
  kind: 'obstacle' | 'construction',
  lateralM: number | null = null,
): StaticSpec {
  if (kind === 'construction') {
    return { id, kind, lane, s, lateralM, lengthM: 1.2, widthM: 2.2 };
  }
  return { id, kind, lane, s, lateralM, lengthM: 0.9, widthM: 0.9 };
}

function base(
  level: LevelConfig,
  seed: number,
): Omit<
  ScenarioConfig,
  'vehicles' | 'statics' | 'pedestrians' | 'signals' | 'crosswalks' | 'events' | 'curve'
> {
  return {
    levelId: level.id,
    seed,
    lengthM: level.lengthM,
    laneCount: level.laneCount,
    laneWidthM: LANE_WIDTH_M,
    speedLimitKmh: level.speedLimitKmh,
    startSpeedKmh: level.startSpeedKmh,
    manual: level.manual,
  };
}

function addSignal(
  id: string,
  s: number,
  offsetS: number,
  signals: SignalSpec[],
  crosswalks: number[],
): void {
  signals.push({ id, s, offsetS });
  crosswalks.push(s + 6);
}

function trafficForFollowing(levelId: number, rng: Rng): VehicleSpec[] {
  const vehicles: VehicleSpec[] = [];
  const speedChanges: SpeedChange[] = [];
  const changes = levelId === 4 ? 4 : 6;
  for (let i = 1; i <= changes; i += 1) {
    speedChanges.push({
      atS: 80 + i * 110,
      speedMps: rng.range(50, 80) / 3.6,
    });
  }
  vehicles.push(
    vehicle('lead', 0, 35, 60, {
      speedChanges,
      brakeAtS:
        levelId === 4 ? [rng.range(240, 300), rng.range(420, 500), rng.range(620, 700)] : [],
      body: 'suv',
    }),
  );

  // 相邻车道连续车流：间距 35～55 m，持续阻挡变道
  let s = 10;
  for (let i = 0; i < 16; i += 1) {
    vehicles.push(
      vehicle(`adj-${i}`, 1, s, rng.range(55, 68), { body: i % 3 === 0 ? 'suv' : 'sedan' }),
    );
    s += rng.range(35, 55);
  }
  return vehicles;
}

function buildLevel2(rng: Rng, result: MutableScenario): void {
  const lanes = [1, 1, -1];
  const positions = [130, 300, 470];
  for (let i = 0; i < positions.length; i += 1) {
    const lane = lanes[i] ?? 1;
    result.statics.push(
      staticObstacle(
        `obstacle-${i}`,
        lane,
        positions[i] ?? 0,
        i === 1 ? 'construction' : 'obstacle',
      ),
    );
  }
  void rng;
}

function buildLevel5(rng: Rng, result: MutableScenario): void {
  result.vehicles.push(vehicle('slow-lead', 0, 30, 40, { body: 'truck' }));
  result.vehicles.push(vehicle('adj-rear', 1, 20, 62));
  result.vehicles.push(vehicle('adj-front', 1, 430, 58, { body: 'suv' }));
  result.vehicles.push(vehicle('adj-far', 1, 760, 65));
  result.events.push({ type: 'leadBrake', s: 30, lane: 0 });
  void rng;
}

function buildLevel6(rng: Rng, result: MutableScenario): void {
  addSignal('light-1', 320, rng.range(0, 20), result.signals, result.crosswalks);
  addSignal('light-2', 720, rng.range(0, 20), result.signals, result.crosswalks);
  result.pedestrians.push({
    id: 'ped-1',
    s: 326,
    startLateralM: LANE_WIDTH_M + 0.6,
    direction: -1,
    walkAtS: 216,
    speedMps: 1.15,
  });
  result.pedestrians.push({
    id: 'ped-2',
    s: 726,
    startLateralM: -(LANE_WIDTH_M + 0.6),
    direction: 1,
    walkAtS: 616,
    speedMps: 1.15,
  });
  result.events.push({ type: 'signal', s: 320, lane: 0 });
  result.events.push({ type: 'pedestrian', s: 326, lane: 0 });
  result.events.push({ type: 'signal', s: 720, lane: 0 });
  result.events.push({ type: 'pedestrian', s: 726, lane: 0 });
  // 路口横向来车：红灯时从路侧横穿，绿灯时停在路侧等待
  result.vehicles.push(
    vehicle('cross-1', -1, 326, 0, {
      body: 'suv',
      crossingDir: 1,
      crossSpeedMps: 5,
      lateralM: LANE_WIDTH_M + 5,
    }),
  );
  result.vehicles.push(
    vehicle('cross-2', -1, 726, 0, {
      body: 'sedan',
      crossingDir: -1,
      crossSpeedMps: 5,
      lateralM: -(LANE_WIDTH_M + 5),
    }),
  );
}

function buildLevel7(rng: Rng, result: MutableScenario): void {
  // 第七关保持直线三车道，难度来自密集交通与连续随机事件，而不是弯道
  result.curve = null;
  const types: readonly ScenarioEventType[] = ['leadBrake', 'pedestrian', 'construction', 'signal'];
  const first = rng.shuffle(types);
  const second = rng.shuffle(types);
  const order = [...first, ...second.slice(0, 3)];

  // 前方相邻车道的同向车流与路肩设施，避免开局完全空旷
  result.vehicles.push(
    vehicle('warm-left', 0, 45, rng.range(52, 62), { body: 'sedan' }),
    vehicle('warm-right', 2, 110, rng.range(58, 68), { body: 'truck' }),
  );
  result.statics.push(
    staticObstacle('start-cone-left', -1, 35, 'obstacle', -6.4),
    staticObstacle('start-cone-right', -1, 60, 'obstacle', 6.4),
    staticObstacle('start-barrier-right', -1, 110, 'construction', 6.8),
  );

  order.forEach((type, index) => {
    const s = 220 + index * 330 + rng.range(-15, 15);
    result.events.push({ type, s, lane: 1 });
    if (type === 'leadBrake') {
      result.vehicles.push(
        vehicle(`lead-${index}`, 1, s, rng.range(55, 75), {
          brakeAtS: [s + rng.range(50, 80)],
          speedChanges: [{ atS: s + 140, speedMps: rng.range(72, 88) / 3.6 }],
          body: index % 2 === 0 ? 'suv' : 'sedan',
        }),
      );
    } else if (type === 'pedestrian') {
      addSignal(`light-${index}`, s, rng.range(0, 20), result.signals, result.crosswalks);
      result.pedestrians.push({
        id: `ped-${index}`,
        s: s + 6,
        startLateralM: LANE_WIDTH_M * 1.5 + 0.6,
        direction: rng.next() > 0.5 ? -1 : 1,
        walkAtS: s - 110,
        speedMps: 1.15,
      });
    } else if (type === 'cutIn') {
      result.vehicles.push(
        vehicle(`cut-${index}`, 0, s - 60, rng.range(68, 78), {
          cutInAtS: s,
          cutInLane: 1,
          body: 'suv',
        }),
      );
    } else if (type === 'construction') {
      result.statics.push(
        staticObstacle(`work-${index}`, -1, s, 'construction', index % 2 === 0 ? 6.4 : -6.4),
      );
      result.vehicles.push(vehicle(`work-adj-${index}`, 2, s + 30, 65));
    } else if (type === 'signal') {
      addSignal(`light-${index}`, s, rng.range(0, 20), result.signals, result.crosswalks);
    }
  });

  // 中后段随机车流：只放在相邻车道，避免从本车后方追尾
  for (let i = 0; i < 6; i += 1) {
    const lane = i % 2 === 0 ? 0 : 2;
    result.vehicles.push(
      vehicle(`flow-${i}`, lane, 320 + i * 380 + rng.range(-40, 40), rng.range(55, 75), {
        body: i % 3 === 0 ? 'suv' : 'sedan',
      }),
    );
  }
}

interface MutableScenario {
  vehicles: VehicleSpec[];
  statics: StaticSpec[];
  pedestrians: PedestrianSpec[];
  signals: SignalSpec[];
  crosswalks: number[];
  events: ScenarioEvent[];
  curve: CurveConfig | null;
}

/**
 * 确定性场景生成：相同关卡 + 相同 seed 得到完全相同的场景。
 * 所有实体在开局即存在，避免在前方安全区内“突现”。
 */
export function generateScenario(levelId: number, seed: number): ScenarioConfig {
  const level = getLevel(levelId);
  if (!level) {
    throw new Error(`未知关卡：${levelId}`);
  }
  const rng = createRng(seed);
  const result: MutableScenario = {
    vehicles: [],
    statics: [],
    pedestrians: [],
    signals: [],
    crosswalks: [],
    events: [],
    curve: null,
  };

  if (levelId === 2) {
    buildLevel2(rng, result);
  } else if (levelId === 3 || levelId === 4) {
    result.vehicles.push(...trafficForFollowing(levelId, rng));
    result.events.push({ type: 'leadBrake', s: 35, lane: 0 });
  } else if (levelId === 5) {
    buildLevel5(rng, result);
  } else if (levelId === 6) {
    buildLevel6(rng, result);
  } else if (levelId === 7) {
    buildLevel7(rng, result);
  }

  return {
    ...base(level, seed),
    ...result,
  };
}

export function curveOffset(curve: CurveConfig | null, s: number): number {
  if (!curve) {
    return 0;
  }
  // 余弦缓入：起点切线为 0，避免开局出现一条斜直线
  return (curve.amplitudeM * (1 - Math.cos((s / curve.wavelengthM) * Math.PI * 2))) / 2;
}
