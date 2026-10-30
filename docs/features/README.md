# 功能拆分（SDD）

> **项目简报**：《AI 智驾模拟器》= 手机竖屏、单人、可离线游玩的智驾观察小游戏。玩家观察虚拟智驾系统完成感知、决策与控制，必要时接管，结束后查看评分报告。功能与验收的唯一依据是根目录 `requirement.md`；技术选型与工程约定见 `AGENTS.md`。

本目录把 `requirement.md` 拆成 12 个可独立实现、独立验收的功能点。每个功能点一份文档，结构一致：目标 → 需求 → 流程与规则 → 模块接口 → 验收 → 素材。

## 功能地图

| 编号                            | 功能点               | 需求编号              | 主要模块                                      | 素材                                                | 状态         |
| ------------------------------- | -------------------- | --------------------- | --------------------------------------------- | --------------------------------------------------- | ------------ |
| [F01](F01-nav-shell.md)         | 入口、导航与对局管理 | NAV-01～10            | `src/app/`、`src/ui/`                         | menu-hero、app-icon、sfx-ui-click、sfx-countdown    | 已实现待验证 |
| [F02](F02-hud.md)               | 局内画面与信息面板   | HUD-01～12            | `src/ui/hud.ts`、`src/render/`                | risk-icon-sheet、control-buttons-sheet、sfx-warning | 已实现待验证 |
| [F03](F03-vehicle-collision.md) | 车辆运动与碰撞       | VEH-01～08            | `src/game/vehicle.ts`、`geometry.ts`、`simulation.ts` | vehicle-*、road-asphalt-tile、sfx-collision         | 已实现待验证 |
| [F04](F04-perception.md)        | 虚拟感知             | SEN-01～11            | `src/game/perception.ts`                      | pedestrian-sheet、cone、barrier                     | 已实现待验证 |
| [F05](F05-decision-control.md)  | 智驾决策与控制       | AI-01～13             | `src/game/decision/`、`control.ts`            | sfx-aeb、sfx-turn-signal                            | 已实现待验证 |
| [F06](F06-takeover.md)          | 人工接管与交还       | TAK-01～10            | `src/game/decision/machine.ts`、`simulation.ts` | sfx-takeover-alert、control-buttons-sheet           | 已实现待验证 |
| [F07](F07-policy.md)            | 驾驶策略             | POL-01～06            | `src/config/policies.ts`                      | 无                                                  | 已实现待验证 |
| [F08](F08-levels.md)            | 关卡与场景           | LVL-01～12            | `src/game/scenario.ts`、`src/config/levels.ts` | level-cards-sheet                                   | 已实现待验证 |
| [F09](F09-scoring-report.md)    | 评分与智驾报告       | SCR-01～10            | `src/game/scoring.ts`、`telemetry.ts`、`src/app/screens/result.ts` | star-sheet、sfx-report                              | 已实现待验证 |
| [F10](F10-save-settings.md)     | 进度与设置保存       | SAV-01～07            | `src/core/storage.ts`、`migrations.ts`、`src/app/save.ts` | 无                                                  | 已实现待验证 |
| [F11](F11-tutorial.md)          | 教学与可视化         | EDU-01～06            | `src/ui/tutorial.ts`、`src/render/canvas.ts`   | control-buttons-sheet、sfx-ui-click                 | 已实现待验证 |
| [F12](F12-env-performance.md)   | 运行环境、适配与性能 | ENV-01～12、PF-01～10 | `src/app/`、`src/render/`、`public/sw.js`     | app-icon、menu-hero                                 | 已实现待验证 |

## 实现顺序（依赖从下往上）

```text
F03 车辆/物理 ─┬─→ F04 感知 ─→ F05 决策控制 ─→ F06 接管 ─→ F07 策略
               │                                    │
               └─→ F08 关卡 ────────────────────────┴─→ F09 评分
F01 导航外壳 ─→ F02 HUD ─→ F11 教学
F10 存档（F09 之后接入）  F12 环境/性能（贯穿全程）
```

## 全局约定

1. 任何功能实现的数值必须能追溯到 `requirement.md` 的表格或本目录文档；改动先改需求。
2. 每个功能点完成后，需在本文档状态列更新为“已完成”，并附上验收记录位置。
3. 素材一律引用 `docs/assets/` 中的素材文档；未就绪时使用几何占位，不得阻塞开发。
4. 单局流程、单帧顺序、状态机迁移以 `requirement.md` 第 4 章为准，各功能文档只补充实现细节。
