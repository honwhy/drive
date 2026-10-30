# F10 进度与设置保存（SAV）

> 需求来源：`requirement.md` §3.10 ｜ 技术约定：`AGENTS.md` §7.3 ｜ 状态：已实现待验证（见 [PROGRESS](PROGRESS.md)）

## 1. 目标

在本机保存关卡解锁、最佳成绩、星级、设置与上次策略；存储失败时降级为内存态并明确提示，绝不阻断游戏。

## 2. 需求范围

SAV-01 保存内容、SAV-02 保存时机、SAV-03 恢复、SAV-04 重置、SAV-05 存储不可用、SAV-06 数据边界、SAV-07 版本兼容（P1）。

## 3. 数据结构

```ts
interface ProgressV1 {
  version: 1;
  unlockedLevel: number; // 1..7
  best: Record<number, { score: number; stars: 1 | 2 | 3 | 4 | 5 }>;
  settings: { sound: boolean; sensorOverlay: boolean; haptics: boolean };
  lastPolicy: 'conservative' | 'normal' | 'aggressive';
}
```

键名：`ads.v1.progress`、`ads.v1.settings`、`ads.v1.best`。三个键独立读写，任一损坏不影响其余。

## 4. 规则

- 写入时机：对局结束、设置变更、解锁、重置；禁止每帧写入。
- 读取时校验 `version` 与字段类型；不匹配回退默认值，不抛错阻断启动。
- 存储不可用（隐私模式、配额满）：切换到内存实现，提示“本次进度不会保存”。
- 重置需二次确认（自定义弹层，不用系统 confirm）。
- 不存个人信息、设备标识、位置、行为日志。

## 5. 模块与接口

```ts
interface StorageAdapter {
  read<T>(key: string, parse: (raw: unknown) => T | null): T | null;
  write(key: string, value: unknown): boolean;
  remove(key: string): void;
  readonly persistent: boolean;
}
function createStorage(): StorageAdapter;
```

- `src/core/storage.ts`：只做序列化、校验、降级；不含业务规则。
- 迁移函数集中在 `src/core/migrations.ts`，不散落 UI。

## 6. 测试要点

| 用例          | 期望                           |
| ------------- | ------------------------------ |
| 正常读写      | 重启后进度与设置恢复           |
| 损坏 JSON     | 回退默认值，不崩溃             |
| 版本不匹配    | 回退默认值并记录一次警告       |
| 配额满 / 禁用 | 降级内存态，有提示，可继续游玩 |
| 重置          | 二次确认后清空，取消不变       |

## 7. 验收映射

AC-SAV-01～04、AC-FL-08（刷新恢复）、AC-ENV-09（稳定性）。

## 8. 素材

无图片或音频素材；提示文案在 `src/ui/strings.ts`。

## 9. 依赖

F09（最佳成绩结构）、F01（设置入口）。
