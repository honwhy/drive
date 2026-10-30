# F04 虚拟感知（SEN）

> 需求来源：`requirement.md` §3.4 ｜ 技术约定：`AGENTS.md` §6.4 ｜ 状态：已实现待验证（见 [PROGRESS](PROGRESS.md)）

## 1. 目标

把场景真值转换成决策唯一可用的“感知快照”：本车道前车、五条射线距离、目标分类、车道信息、信号灯、后向目标与四级风险。感知必须遮挡正确、边界明确，并与可视化同源。

## 2. 需求范围

SEN-01 前向目标、SEN-02 扇形测距、SEN-03 目标分类、SEN-04 道路车道、SEN-05 信号灯、SEN-06 风险计算、SEN-07 遮挡、SEN-08 后向探测、SEN-09 感知边界、SEN-10 可视化同源、SEN-11 噪声延迟（P2）。

## 3. 快照结构

```ts
interface PerceptionSnapshot {
  tick: number;
  ego: { speedMps: number; laneIndex: number; lateralOffsetM: number };
  lead: { id: string; distanceM: number; relativeSpeedMps: number; ttcS: number | null } | null;
  rays: { angleDeg: -30 | -15 | 0 | 15 | 30; distanceM: number }[];
  objects: PerceptionObject[]; // 已进入范围且未被遮挡
  lane: {
    widthM: number;
    leftLineM: number;
    rightLineM: number;
    stopLineM: number | null;
    onCrosswalk: boolean;
  };
  light: { state: 'red' | 'yellow' | 'green' | 'none'; remainingS: number | null };
  rear: PerceptionObject[]; // 变道时相邻车道后方 200 m 内
  risk: 'safe' | 'caution' | 'warning' | 'danger';
}
```

## 4. 规则

- 射线角度 `-30/-15/0/15/30°`，量程 120 m，无目标返回 120 m。
- 前向目标只取本车道最近车辆；相邻车道车辆不得误判。
- 遮挡：射线与矩形求交取最近命中，命中后的目标不进入快照。
- 后向探测：变道评估时提供相邻车道 200 m 内目标距离与接近速度。
- 风险阈值以 SEN-06 为准；`v < 1 m/s` 时时距用距离表达。
- 噪声与延迟默认关闭（P2）；开启后仍不得产生必然碰撞。

## 5. 感知边界

- 决策层只能拿到 `PerceptionSnapshot`，不得访问 `world.entities`。
- 超范围、被遮挡、类别不明的目标不进入快照。
- 可视化直接渲染同一份快照，禁止另算展示数据。
- 感知频率与决策一致（15 Hz），控制与物理 60 Hz。

## 6. 模块与接口

```ts
function sense(
  world: ReadonlyWorld,
  previous: PerceptionSnapshot | null,
  tick: number,
): PerceptionSnapshot;
function raycast(
  origin: Vec2,
  angleRad: number,
  maxRangeM: number,
  obstacles: readonly Obb[],
): RayHit;
```

- `src/game/perception.ts` 只读世界，不修改状态。
- 空间分区：按车道分桶，只遍历本车道与相邻车道。

## 7. 测试要点

| 用例     | 期望                                      |
| -------- | ----------------------------------------- |
| 射线距离 | 与几何误差 ≤ 0.5 m，无目标返回 120 m      |
| 遮挡     | 近目标挡住远目标，快照中不出现远端        |
| 前车选择 | 只选本车道最近车辆                        |
| 风险边界 | TTC 4/2/1 s 与距离 30/15/8 m 边界不跳变   |
| 后向     | 200 m 内目标及接近速度正确                |
| 同源     | 可视化数据 === 决策数据（同引用或同内容） |

## 8. 验收映射

AC-SEN-01～06、AC-HUD-02（风险一致）、AC-AI-12（能力边界）。

## 9. 素材

| 素材                   | 用途         | 文档                                                       |
| ---------------------- | ------------ | ---------------------------------------------------------- |
| `pedestrian-sheet.png` | 行人目标     | [pedestrian-sheet.md](../assets/image/pedestrian-sheet.md) |
| `cone.png`             | 锥桶目标     | [cone.md](../assets/image/cone.md)                         |
| `barrier.png`          | 施工围挡目标 | [barrier.md](../assets/image/barrier.md)                   |

射线、目标框、风险标记由 Canvas 绘制，不占素材位。

## 10. 依赖

F03（车辆与矩形几何）、F08（道路、信号灯、目标布置）。
