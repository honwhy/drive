/**
 * 全局数值配置。所有可调参数集中在此，禁止散落魔法数字。
 * 具体取值来自 requirement.md，偏离前先改需求。
 */
export const SIMULATION = {
  /** 物理固定步长（秒） */
  stepSeconds: 1 / 60,
  /** 单帧最多追赶步数，避免切后台后补跑 */
  maxCatchUpSteps: 5,
  /** 单帧时间上限（秒），超过按上限处理 */
  maxFrameSeconds: 0.25,
  /** 决策频率（Hz），控制与物理仍为 60 Hz */
  decisionHz: 15,
  /** HUD 文本刷新频率（Hz） */
  hudHz: 10,
} as const;

export const EGO = {
  lengthMeters: 4.8,
  widthMeters: 1.9,
} as const;

export const ROAD = {
  laneCount: 3,
  laneWidthMeters: 3.5,
  /** 相机比例：像素 / 米 */
  pixelsPerMeter: 16,
  /** 本车固定在画面下方 70% 处 */
  egoScreenRatioFromTop: 0.7,
  dashLengthMeters: 3,
  dashGapMeters: 6,
} as const;

export const RENDER = {
  /** Canvas 像素比上限，避免高分屏过度绘制 */
  maxPixelRatio: 2,
} as const;

export const SENSOR = {
  /** 前向扇形测距：-30°～30°，共 5 条（SEN-02） */
  rayAnglesDeg: [-30, -15, 0, 15, 30] as const,
  /** 前向探测距离（米） */
  rayRangeM: 120,
  /** 变道时后向探测距离（米），F05 使用 */
  rearRangeM: 200,
} as const;

export const VEHICLE = {
  /** 普通油门最大加速度（m/s²） */
  accelMps2: 2.5,
  /** 普通制动最大减速度（m/s²） */
  brakeMps2: 4.0,
  /** 紧急制动减速度（m/s²） */
  emergencyBrakeMps2: 9.0,
  /** 无输入滑行减速度（m/s²） */
  coastMps2: 0.5,
  /** 手动模式最高车速（km/h） */
  maxManualSpeedKmh: 120,
  /** 最大横向加速度（m/s²） */
  maxLateralAccel: 3.5,
  /** 横向加速度变化率（m/s³），避免瞬移 */
  lateralJerk: 8,
  /** 纵向加速度变化率（m/s³） */
  longitudinalJerk: 10,
} as const;

export const RISK = {
  ttcSafeS: 4,
  ttcCautionS: 2,
  ttcWarningS: 1,
  distanceSafeM: 30,
  distanceCautionM: 15,
  distanceWarningM: 8,
  closeDangerM: 5,
  tailgatingGapS: 0.8,
  tailgatingHoldS: 1,
} as const;

export const DECISION = {
  /** 常规加速度上限（AI-03） */
  maxAccelMps2: 2.0,
  /** 常规减速度上限（AI-03） */
  maxBrakeMps2: 3.0,
  accelMarginM: 5,
  brakeMarginM: 3,
  aebTtcS: 1.2,
  aebRequiredDecelMps2: 6.0,
  aebExitTtcS: 2.0,
  laneChangeSignalS: 0.5,
  laneChangeMinS: 2.5,
  laneChangeMaxS: 4,
  laneChangeCooldownS: 5,
  takeoverCountdownS: 3,
  resumeGapFactor: 1.5,
  stopLineTargetM: 1,
  comfortableBrakeMps2: 3.0,
  pedestrianClearWaitS: 1,
} as const;

export const SCORING = {
  weights: { safety: 0.4, comfort: 0.25, decision: 0.2, laneChange: 0.15 },
  passScore: 60,
  collisionCap: 50,
  hardBrakeMps2: -4.0,
  hardBrakeHoldS: 0.3,
  hardAccelMps2: 2.5,
  hardAccelHoldS: 0.3,
  sharpTurnMps2: 3.5,
  speedingOverKmh: 10,
  speedingHoldS: 2,
  laneDepartureM: 0.5,
  laneDepartureHoldS: 1,
} as const;

export const TUTORIAL = {
  accelTargetKmh: 20,
  brakeTargetKmh: 5,
  steerHoldS: 2,
} as const;
