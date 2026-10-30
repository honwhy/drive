/** 游戏领域共享类型：game 层不依赖 ui / render。 */

export type RiskLevel = 'safe' | 'caution' | 'warning' | 'danger';

export type DriveMode = 'auto' | 'manual' | 'takeoverRequest';

export type DecisionState =
  | 'cruise'
  | 'follow'
  | 'laneChange'
  | 'yield'
  | 'stop'
  | 'decelerate'
  | 'takeoverRequest'
  | 'manual'
  | 'finished';

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** 带朝向矩形：x 向右、y 向前，heading 以 +y 为 0、顺时针为正（弧度）。 */
export interface Obb {
  readonly cx: number;
  readonly cy: number;
  readonly halfWidth: number;
  readonly halfLength: number;
  readonly heading: number;
}

export interface EgoState {
  /** 沿道路中心线累计前进距离（米） */
  readonly s: number;
  /** 相对道路中心线的横向偏移（米），右为正 */
  readonly lateralM: number;
  readonly heading: number;
  readonly speedMps: number;
  readonly accelMps2: number;
  readonly lateralVelMps: number;
  readonly steer: number;
  readonly laneIndex: number;
}

export interface VehicleInput {
  readonly throttle: number;
  readonly brake: number;
  readonly steer: number;
  readonly emergency: boolean;
}

export type EntityKind = 'vehicle' | 'pedestrian' | 'obstacle' | 'construction';

export interface EntityState {
  readonly id: string;
  readonly kind: EntityKind;
  readonly lane: number;
  readonly s: number;
  readonly lateralM: number;
  readonly speedMps: number;
  readonly lengthM: number;
  readonly widthM: number;
  readonly body: 'sedan' | 'suv' | 'truck';
  /** 行人横穿方向；0 表示不横穿 */
  readonly crossingDir: -1 | 0 | 1;
}

export interface TrafficLight {
  readonly state: 'red' | 'yellow' | 'green' | 'none';
  readonly remainingS: number | null;
}

export interface PerceptionObject {
  readonly id: string;
  readonly kind: EntityKind;
  /** 相对本车的纵向距离（前为正） */
  readonly forwardM: number;
  /** 相对本车的横向距离（右为正） */
  readonly lateralM: number;
  readonly speedMps: number;
  readonly lengthM: number;
  readonly widthM: number;
  readonly risk: RiskLevel;
}

export interface PerceptionRay {
  readonly angleDeg: number;
  readonly distanceM: number;
}

export interface PerceptionLead {
  readonly id: string;
  /** 车头到前车车尾的净距 */
  readonly distanceM: number;
  readonly relativeSpeedMps: number;
  readonly ttcS: number | null;
}

export interface PerceptionSnapshot {
  readonly tick: number;
  readonly ego: {
    readonly speedMps: number;
    readonly laneIndex: number;
    readonly lateralOffsetM: number;
  };
  readonly lead: PerceptionLead | null;
  readonly rays: readonly PerceptionRay[];
  readonly objects: readonly PerceptionObject[];
  readonly lane: {
    readonly laneCount: number;
    readonly widthM: number;
    readonly leftLineM: number;
    readonly rightLineM: number;
    readonly stopLineM: number | null;
    readonly onCrosswalk: boolean;
    readonly speedLimitKmh: number;
  };
  readonly light: TrafficLight;
  readonly rear: readonly PerceptionObject[];
  readonly risk: RiskLevel;
}
