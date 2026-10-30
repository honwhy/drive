# F03 车辆运动与碰撞（VEH）

> 需求来源：`requirement.md` §3.3 ｜ 技术约定：`AGENTS.md` §6.1、§6.2、§6.4 ｜ 状态：已实现待验证（见 [PROGRESS](PROGRESS.md)）

## 1. 目标

提供确定性的车辆运动模型与碰撞判定，作为感知、决策、评分的地基。相同初始状态 + 相同输入必须得到相同轨迹，与渲染帧率无关。

## 2. 需求范围

VEH-01 车辆状态、VEH-02 纵向控制、VEH-03 横向控制、VEH-04 车道约束、VEH-05 碰撞判定、VEH-06 运动一致性、VEH-07 操控手感、VEH-08 参数基线。

## 3. 运动模型

- 状态：位置 `(x, y)`、航向 `heading`、速度 `v`、纵向加速度 `a`、横向偏移 `offset`、转向输入、当前车道。
- 纵向：`v += a·dt`，`a` 由油门/刹车/滑行决定；上限取 `min(策略最高车速, 道路限速, 弯道限速)`。
- 横向：转向输入改变横向速度与航向，最大横向加速度受限；松手回正，不允许瞬移。
- 基线参数（可调，差异需可感知）：普通加速 ≈ 2.5 m/s²、常规制动 ≈ 4.0 m/s²、紧急制动 ≈ 9.0 m/s²、滑行减速 ≈ 0.5 m/s²。
- 单位：模拟层 SI；km/h 只在 UI 层出现。

## 4. 碰撞与边界

- 车辆用带朝向矩形（OBB），碰撞用 SAT；行人与锥桶用 AABB/OBB 简化但不得退化为圆形。
- 本车与车辆、行人、施工设施、道路边界重叠即碰撞，立即结束本局并记录对象与相对速度。
- 道路边界是实体边界：越过即碰撞，不允许“越界但不判定”。
- 碰撞检测在物理步之后执行，使用本步结束状态。

## 5. 模块与接口

```ts
interface VehicleState {
  x: number;
  y: number;
  heading: number;
  speed: number;
  accel: number;
  lateralOffset: number;
  laneIndex: number;
  lengthM: number;
  widthM: number;
}
interface VehicleInput {
  throttle: number;
  brake: number;
  steer: number;
} // 0..1 / -1..1
function stepVehicle(state: VehicleState, input: VehicleInput, dt: number): VehicleState;
function detectCollision(a: VehicleState, b: Obb, road: RoadGeometry): CollisionResult | null;
```

- `stepVehicle` 为纯函数，返回新状态，不在内部读全局。
- 物理步长固定 1/60 s，由 `src/game/loop.ts` 保证；不要把 `dt` 传入决策层。

## 6. 测试要点

| 用例          | 期望                                   |
| ------------- | -------------------------------------- |
| 加速至巡航    | 到达目标速度后稳定，不抖动             |
| 制动到停      | 停车后不倒退、不抖动                   |
| 转向回正      | 松手后航向收敛，无持续偏转             |
| 边界          | 越界即碰撞，不穿模                     |
| 车-车 / 车-人 | OBB 重叠判定准确，误差 ≤ 0.1 m         |
| 帧率一致性    | 30/60/120 Hz 下 10 s 轨迹终点误差 ≤ 1% |

## 7. 验收映射

AC-VEH-01～05、AC-FL-07（帧率无关）、AC-ENV-03（暂停不推进）。

## 8. 素材

| 素材                    | 用途     | 文档                                                         |
| ----------------------- | -------- | ------------------------------------------------------------ |
| `vehicle-ego.png`       | 本车     | [vehicle-ego.md](../assets/image/vehicle-ego.md)             |
| `vehicle-sedan.png`     | 同向轿车 | [vehicle-sedan.md](../assets/image/vehicle-sedan.md)         |
| `vehicle-suv.png`       | 同向 SUV | [vehicle-suv.md](../assets/image/vehicle-suv.md)             |
| `vehicle-truck.png`     | 货车     | [vehicle-truck.md](../assets/image/vehicle-truck.md)         |
| `road-asphalt-tile.png` | 路面平铺 | [road-asphalt-tile.md](../assets/image/road-asphalt-tile.md) |
| `sfx-collision.m4a`     | 碰撞音   | [sfx-collision.md](../assets/audio/sfx-collision.md)         |

## 9. 实现备注

已完成：纯函数 `stepVehicle`（油门/刹车/滑行、转向回正、横向加速度限制）、OBB/SAT、射线求交、道路边界与实体碰撞、碰撞原因、固定步长模拟接入。测试覆盖加速/制动/转向回正/30-60-120 Hz 一致性/边界碰撞。

## 10. 依赖

F08（道路几何与限速）。
