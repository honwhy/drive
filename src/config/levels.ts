/** 关卡配置：静态说明 + 场景生成参数 + 通过规则。 */

export interface LevelRules {
  /** 第 1 关必须完成 3 步教学 */
  readonly tutorial?: boolean;
  /** 跟车时距 ≥ 1.0 s 的时间占比下限 */
  readonly minSafeGapRatio?: number;
  /** 必须至少完成一次成功变道 */
  readonly requireLaneChange?: boolean;
  readonly zeroRedLight?: boolean;
  readonly zeroNoYield?: boolean;
}

export interface LevelConfig {
  readonly id: number;
  readonly name: string;
  readonly goal: string;
  readonly lengthM: number;
  readonly concept: string;
  readonly failures: readonly string[];
  readonly laneCount: number;
  readonly speedLimitKmh: number;
  readonly startSpeedKmh: number;
  readonly manual: boolean;
  readonly rules: LevelRules;
}

export const LEVELS: readonly LevelConfig[] = [
  {
    id: 1,
    name: '汽车会动',
    goal: '完成 500 m 直道行驶，掌握加速、刹车与转向',
    lengthM: 500,
    concept: '车辆运动：油门、刹车与转向如何改变车辆状态',
    failures: ['驶出道路', '发生碰撞', '未完成三步教学'],
    laneCount: 2,
    speedLimitKmh: 60,
    startSpeedKmh: 0,
    manual: true,
    rules: { tutorial: true },
  },
  {
    id: 2,
    name: '汽车会看',
    goal: '在 600 m 直道中识别并避开静止障碍',
    lengthM: 600,
    concept: '感知：系统只能“看见”射线与目标框内的东西',
    failures: ['碰撞障碍物', '驶出道路'],
    laneCount: 2,
    speedLimitKmh: 60,
    startSpeedKmh: 40,
    manual: false,
    rules: {},
  },
  {
    id: 3,
    name: '汽车会跟车',
    goal: '保持安全时距跟随前车完成 800 m',
    lengthM: 800,
    concept: '时距：前车距离 ÷ 本车速度，越大越安全',
    failures: ['碰撞', '时距 ≥ 1.0 s 的占比低于 80%'],
    laneCount: 2,
    speedLimitKmh: 60,
    startSpeedKmh: 40,
    manual: false,
    rules: { minSafeGapRatio: 0.8 },
  },
  {
    id: 4,
    name: '汽车会刹车',
    goal: '在前车三次急刹中保持零碰撞',
    lengthM: 800,
    concept: 'AEB：来不及人工制动时的最后一道保险',
    failures: ['碰撞前车'],
    laneCount: 2,
    speedLimitKmh: 60,
    startSpeedKmh: 40,
    manual: false,
    rules: {},
  },
  {
    id: 5,
    name: '汽车会变道',
    goal: '完成至少一次安全变道并到达终点',
    lengthM: 1000,
    concept: '变道窗口：前后都有足够空间才允许变道',
    failures: ['碰撞', '本局零次成功变道'],
    laneCount: 2,
    speedLimitKmh: 60,
    startSpeedKmh: 40,
    manual: false,
    rules: { requireLaneChange: true },
  },
  {
    id: 6,
    name: '汽车会过路口',
    goal: '通过两个信号灯路口并礼让行人',
    lengthM: 1000,
    concept: '路权与让行：红灯停、行人优先',
    failures: ['碰撞', '闯红灯', '未让行'],
    laneCount: 2,
    speedLimitKmh: 60,
    startSpeedKmh: 40,
    manual: false,
    rules: { zeroRedLight: true, zeroNoYield: true },
  },
  {
    id: 7,
    name: '智驾挑战',
    goal: '在 3 km 随机综合场景中零碰撞完成',
    lengthM: 3000,
    concept: '随机事件：前车急刹、行人横穿、施工围挡、信号灯；叠加三车道车流与连续事件',
    failures: ['碰撞', '综合评分低于 60'],
    laneCount: 3,
    speedLimitKmh: 80,
    startSpeedKmh: 40,
    manual: false,
    rules: { zeroRedLight: true, zeroNoYield: true },
  },
];

export function getLevel(id: number): LevelConfig | undefined {
  return LEVELS.find((level) => level.id === id);
}

export const MAX_LEVEL = 7;
