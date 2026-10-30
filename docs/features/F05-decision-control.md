# F05 智驾决策与控制（AI）

> 需求来源：`requirement.md` §3.5、§4.3～4.5 ｜ 技术约定：`AGENTS.md` §6.5 ｜ 状态：已实现待验证（见 [PROGRESS](PROGRESS.md)）

## 1. 目标

把感知快照变成可解释的驾驶行为：车道保持、ACC、AEB、变道、路口、行人让行、施工绕行；全部决策带原因码，输入只有感知。

## 2. 需求范围

AI-01 车道保持、AI-02 ACC、AI-03 控制平滑、AI-04 AEB、AI-05 变道、AI-06 路口、AI-07 行人与施工、AI-08 状态机、AI-09 状态稳定、AI-10 超速约束、AI-11 能力降级、AI-12 安全兜底、AI-13 决策频率。

## 3. 状态机

```text
CRUISE ⇄ FOLLOW → LANE_CHANGE → FOLLOW/CRUISE
   ↓         ↓
 YIELD / STOP（路口、行人、停止线）
   ↓
TAKEOVER_REQUEST → MANUAL → 交还 → FOLLOW/CRUISE
   ↓
FINISHED（终点、碰撞、安全停车）
```

- 同一时刻只有一个状态，迁移必须带守卫条件与退出动作。
- 决策 15 Hz，控制 60 Hz；两次决策之间保持上一次结果。
- 每次决策输出 `{ state, reasonCode, targetSpeed, steer, brake, throttle }`。

## 4. 规则要点

| 行为     | 规则                                                                           |
| -------- | ------------------------------------------------------------------------------ |
| 车道保持 | 直道横向偏移 ≤ 0.3 m，弯道 ≤ 0.7 m                                             |
| ACC      | 目标距离 = max(5 m, v × 时距)；> 目标 +5 m 加速，< 目标 −3 m 减速，区间内保持  |
| 平顺性   | 常规减速度 ≤ 3.0 m/s²，常规加速度 ≤ 2.0 m/s²，变化连续                         |
| AEB      | TTC ≤ 1.2 s 或所需减速度 ≥ 6.0 m/s² 时全力制动；TTC > 2.0 s 或停稳后退出       |
| 变道     | 触发 → 禁止区 → 前后安全 → 打灯 ≥ 0.5 s → 2.5～4 s 执行 → 中止/完成 → 冷却 5 s |
| 路口     | 红灯停在线前 0～2 m；黄灯按 ≤ 3.0 m/s² 舒适停车；行人离开后 ≥ 1 s 起步         |
| 超速     | 目标车速取策略/道路/弯道三者最小值，超速 ≤ 5 km/h                              |
| 降级     | 3.5 s 内不可避免碰撞、施工无窗口、感知失效 → 请求接管并持续制动                |

## 5. 模块与接口

```ts
interface DecisionOutput {
  state: DecisionState;
  reasonCode: string; // 与文案分离
  targetSpeedMps: number;
  throttle: number;
  brake: number;
  steer: number;
}
function decide(snapshot: PerceptionSnapshot, policy: Policy, tick: number): DecisionOutput;
```

- `src/game/decision/`：`machine.ts`、`acc.ts`、`aeb.ts`、`laneChange.ts`、`intersection.ts`。
- `src/game/control.ts`：行为 → 油门/刹车/转向。
- 决策模块禁止 import `world`。

## 6. 测试要点

| 用例     | 期望                                                  |
| -------- | ----------------------------------------------------- |
| ACC 稳态 | 60 km/h 跟车 30 s，时距目标 ±0.4 s，速度波动 ≤ 3 km/h |
| ACC 变速 | 前车 50～80 km/h 变化，不追尾、无连续急刹             |
| AEB      | 60 km/h/25 m 与 120 km/h/100 m 均不碰撞，停距 ≥ 2 m   |
| 变道     | 打灯 ≥ 0.5 s，2.5～4 s 完成，一次一条，冷却 5 s       |
| 变道中止 | 出现风险立即回原车道                                  |
| 路口     | 红灯 0～2 m 停车，零闯红灯                            |
| 状态稳定 | 10 s 内非必要切换 ≤ 2 次                              |

## 7. 验收映射

AC-AI-01～13、AC-FL-07（帧率无关）。

## 8. 素材

| 素材                  | 用途     | 文档                                                     |
| --------------------- | -------- | -------------------------------------------------------- |
| `sfx-aeb.m4a`         | AEB 提示 | [sfx-aeb.md](../assets/audio/sfx-aeb.md)                 |
| `sfx-turn-signal.m4a` | 变道打灯 | [sfx-turn-signal.md](../assets/audio/sfx-turn-signal.md) |

## 9. 依赖

F04（感知）、F07（策略参数）、F08（道路与事件）。F03 提供物理执行。
