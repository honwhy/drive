# AGENTS.md

## 1. 项目概览

- 项目：**AI 智驾模拟器**，移动端竖屏小游戏。
- 玩法：观察虚拟智驾系统完成感知、决策与控制，必要时人工接管，结束后查看智驾评分报告。
- 需求来源：`requirement.md`（功能与验收的唯一依据）；背景材料：`docs/draft.md`（只读参考）。
- 交付形态：构建后的纯静态资源，部署到 **Cloudflare Workers Static Assets**。
- 硬约束：
  - 无后端、无数据库、无账号、无排行榜、无云同步、无用户行为分析。
  - 无运行时外部接口、CDN、外部字体或第三方在线资源。
  - 首次加载完成后可离线游玩已解锁内容。
  - 不为“以后可能加服务端”预留后端代码。

## 2. 技术选型

| 领域 | 选型 | 说明 |
| --- | --- | --- |
| 语言 | TypeScript 5.x（`strict`） | 游戏逻辑与 UI 全量 TS，不用 JavaScript 写业务代码 |
| 构建 | Vite 7 | 输出 `dist/` 静态资源，直接作为 Workers Assets 上传 |
| 运行时 | 原生浏览器 API | 不引入 React/Vue/Svelte/Phaser/Three.js 等运行时框架 |
| 世界渲染 | Canvas 2D | 道路、车辆、传感器、特效；俯视/斜俯视 |
| 界面 | 原生 DOM + CSS | 菜单、HUD、暂停、结算、设置；便于文本布局与无障碍 |
| 状态与逻辑 | 纯 TS 模块 + 显式状态机 | 不引入状态管理库；游戏状态与 UI 状态分离 |
| 本地保存 | `localStorage` | 命名空间 + 版本号 + 校验；失败时降级为内存 |
| 离线缓存 | 自研 Service Worker | 缓存应用外壳与同源静态资源；不引入 Workbox |
| 单元测试 | Vitest | 物理、感知、决策、评分、存档 |
| 端到端测试 | Playwright | 移动视口冒烟：加载、开局、暂停、结算、持久化 |
| 代码质量 | ESLint + Prettier | 平铺配置；提交前必须通过 |
| 包管理 | npm | 锁文件使用 `package-lock.json` |
| Node | 22 LTS | 与 Vite 7 / Wrangler 4 兼容 |
| 部署 | Wrangler 4 + Cloudflare Workers Static Assets | 仅静态资源，不写 Worker 运行时代码 |

选择理由：游戏核心是固定步长模拟、几何计算与稳定帧率，运行时框架收益低、包体和 GC 压力大；Canvas 负责高频世界绘制，DOM 负责低频信息与表单，二者边界清晰。Vite 产出带哈希的静态资源，天然适配 Workers Assets 的缓存策略。

**不要擅自引入运行时依赖。** 新增依赖必须同时满足：需求确实需要、体积可接受、可离线、无服务端；并在本文件更新选型说明。开发依赖也应保持精简。

## 3. 目录结构

```text
/
├─ AGENTS.md
├─ requirement.md
├─ docs/
│  ├─ draft.md                 # 背景材料，只读
│  ├─ features/                # 功能拆分（SDD），一个功能点一份文档
│  │  ├─ README.md
│  │  └─ F01-*.md … F12-*.md
│  └─ assets/                  # 素材需求，一个素材一份文档
│     ├─ README.md             # 清单、尺寸、格式、替换流程
│     ├─ image/
│     └─ audio/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ playwright.config.ts
├─ eslint.config.js
├─ wrangler.jsonc
├─ public/
│  ├─ _headers
│  ├─ sw.js                    # 离线缓存，根作用域
│  ├─ icons/                   # 应用图标，待替换占位
│  └─ media/                   # 非哈希静态素材，随 SW 版本缓存
│     ├─ images/               # 精灵与缩略图，待替换占位
│     └─ audio/                # 音效，待替换占位
├─ src/
│  ├─ main.ts                  # 启动入口
│  ├─ styles.css               # 全局样式与安全区
│  ├─ app/                     # 屏幕路由、应用装配、SW 注册
│  ├─ config/                  # 数值、关卡、策略、事件配置
│  ├─ core/                    # 数学、随机数、事件、存储、时间
│  ├─ game/
│  │  ├─ loop.ts               # 固定步长循环
│  │  ├─ simulation.ts         # 感知→决策→控制→物理→碰撞→指标 编排
│  │  ├─ geometry.ts           # OBB/SAT、射线求交
│  │  ├─ vehicle.ts            # 车辆状态与物理
│  │  ├─ perception.ts         # 虚拟传感器
│  │  ├─ decision/             # 状态机、ACC、AEB、变道
│  │  ├─ control.ts            # 行为到油门/刹车/转向
│  │  ├─ scenario.ts           # 关卡场景与事件生成
│  │  ├─ telemetry.ts          # 单局指标采集
│  │  └─ scoring.ts            # 指标与评分
│  ├─ render/                  # Canvas 渲染、相机、精灵
│  ├─ ui/                      # 菜单、HUD、结算、设置、文案
│  └─ types/
├─ tests/
│  ├─ unit/
│  └─ e2e/
```

依赖方向：`ui` / `render` 可以依赖 `game`；`game` 不得依赖 `ui` / `render`；`core` 保持无业务依赖。评分、决策、感知尽量写成可独立测试的纯函数或可注入依赖的模块。

文档分工：`requirement.md` 定义做什么；`docs/features/` 定义每个功能点怎么做与怎么验收；`docs/assets/` 定义素材规格与替换流程；本文件定义技术选型与工程约束。

## 4. 常用命令

```bash
npm install
npm run dev          # 本地开发
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run format       # Prettier
npm run test         # Vitest 单次运行
npm run test:watch   # Vitest 监听
npm run test:e2e     # Playwright
npm run build        # 类型检查 + 生产构建到 dist/
npm run preview      # 预览构建产物
npx wrangler dev     # 以 Workers Assets 方式本地预览
npx wrangler deploy  # 部署到 Cloudflare
```

`package.json` 至少提供上述脚本；`deploy` 可组合为 `npm run build && wrangler deploy`。

`dev` / `preview` 通过 `cross-env NODE_OPTIONS=--dns-result-order=ipv4first vite` 启动，固定监听 `127.0.0.1`，不要退回 IPv6 回环地址 `[::1]`（`server.host` 未显式配置时 Node 的 `verbatim` DNS 顺序会把 `localhost` 解析成 `::1`，导致 `127.0.0.1` 与真机/局域网访问失败）。需要真机调试时用 `npm run dev -- --host 0.0.0.0` 临时覆盖，并注意局域网暴露与防火墙放行。

## 5. Cloudflare Workers 部署

项目使用 **Workers Static Assets**，不写 Worker 入口脚本。构建产物 `dist/` 直接作为静态资源目录。

### 5.1 `wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ai-driving-simulator",
  "compatibility_date": "2026-10-29",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

- `name` 可按实际 Worker 名称修改，部署前确认不与账号下已有项目冲突。
- `compatibility_date` 使用部署时的近期日期；不要设置未来日期。
- 不要添加 `main`；本项目没有服务端逻辑。若未来确实需要服务端能力，必须先更新 `requirement.md` 并重新评审。
- `not_found_handling` 使用 SPA 回退，避免刷新页面 404；如果后续改成多页静态站点，再改为 `404-page`。

### 5.2 缓存与安全头

`public/_headers`（Vite 会复制到 `dist/`）：

```text
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache

/media/*
  Cache-Control: no-cache

/icons/*
  Cache-Control: public, max-age=86400

/sw.js
  Cache-Control: no-cache
  Service-Worker-Allowed: /

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; worker-src 'self'
```

- Vite 的哈希资源可长期缓存；`index.html` 必须每次校验，避免旧入口。
- 如果加入内联脚本或第三方资源，先确认 CSP 兼容性，不要直接删除 CSP。所有资源必须本地化。
- Workers Assets 支持 `_headers` 与 `_redirects`；以 `wrangler dev` 实际验证为准。

### 5.3 部署步骤

1. `npm ci`（或首次 `npm install`）。
2. `npm run typecheck && npm run lint && npm run test && npm run build`。
3. `npx wrangler login`（首次）。
4. `npx wrangler dev` 验证生产构建在 Workers 环境下的路由、缓存头、离线缓存与移动端布局。
5. `npx wrangler deploy`。
6. 记录部署 URL；在真机验证 HTTPS、竖屏布局、首次加载与断网重开。

Cloudflare 控制台接入时：构建命令 `npm run build`，输出目录 `dist`，根路径 `/`。如部署在子路径，必须同步设置 Vite `base` 与静态资源路径，并回归全部验收项。

### 5.4 环境与边界

- 不配置任何环境变量、密钥、KV、D1、R2、Durable Objects 或 Workers AI。
- 不使用 Cloudflare Pages Functions 或服务端渲染。
- 不在运行时请求任何外部域名；CSP 的 `connect-src 'self'` 应保持。
- 自定义域名可选；启用后仍需验证缓存与 CSP 头生效。

### 5.5 离线缓存

- 使用 `public/sw.js` 自研 Service Worker，作用域为站点根路径；不引入 Workbox 或第三方 PWA 插件。
- 仅在 `import.meta.env.PROD` 时注册，开发环境不注册，避免缓存干扰热更新。
- 缓存版本号写在 SW 内（如 `ads-v1`）；激活时删除旧版本缓存；每次发布前更新版本号。
- 导航请求使用 network-first，失败回退到缓存的 `index.html`；同源静态资源使用 cache-first，并在后台更新缓存。
- 不缓存非 GET、非 2xx、跨域请求；不得把任何用户数据写入缓存。
- 所有核心玩法资源在首次进入游戏时加载并完成缓存；不得在关卡进行中按需加载未缓存资源。
- 首次加载完成后，断网重开必须能进入主菜单、游玩已解锁关卡并保存进度。
- 更新版本后，新 SW 激活并提示“有新版本，重新加载后生效”；不要在驾驶中强制刷新。
- 每次发布前用真机验证：在线首开 → 断网重开 → 已解锁关卡可玩 → 结算与保存正常。

## 6. 领域约定

### 6.1 单位与坐标

- 模拟内部统一使用 SI 单位：米（m）、秒（s）、米/秒（m/s）、米/秒²（m/s²）、弧度（rad）。
- 界面展示才转换为 km/h；不得在模拟层混用 km/h。
- 世界坐标：`x` 向右，`y` 向前；航向角以 `+y` 方向为 0，顺时针为正，单位弧度。
- 屏幕坐标 `y` 向下，渲染层负责翻转，不要把屏幕坐标带进模拟层。
- 车道编号从最左侧开始为 0，向右递增；车道宽度默认 3.5 m。
- 角度只在配置与 UI 中使用度，进入模拟层立即转弧度。
- 时间统一用秒；不要用毫秒参与物理计算，避免单位混乱。

### 6.2 模拟循环

- 物理固定步长 `1/60 s`；渲染使用 `requestAnimationFrame`，但不得把渲染帧间隔直接当作物理步长。
- 使用累加器；单帧最大追赶 5 步，帧间隔上限 250 ms。切后台或卡顿后不得补跑大量步数。
- 决策固定为 15 Hz（每 4 个物理步），控制与物理 60 Hz。决策频率必须可配置，但默认值改变需回归 ACC 与变道测试。
- 每步顺序固定：输入 → 感知 → 决策 → 控制 → 物理 → 碰撞/事件 → 指标 → 渲染。
- 暂停、倒计时、结算阶段不推进物理，不累计指标。
- 渲染可以做插值，但模拟状态以固定步结果为准；评分只读模拟状态，不读插值状态。

### 6.3 确定性与随机

- 游戏逻辑内禁止使用 `Math.random()`、`Date.now()`、`performance.now()` 参与模拟结果。
- 场景生成、事件抽取、交通流随机必须使用可注入种子的伪随机数生成器（如 mulberry32）。
- 相同种子 + 相同输入必须得到相同轨迹与评分；测试需覆盖 30/60/120 Hz 渲染帧率下的一致性。
- 随机种子存入本局状态；P2 可在结算页展示。
- 不要把 `dt` 传入决策逻辑；决策按固定 tick 计数。

### 6.4 车辆与感知

- 车辆用带朝向的矩形表示，碰撞用 OBB/SAT；射线与矩形求交取最近命中。不要用圆形粗略代替车辆碰撞。
- 车辆状态只允许通过物理步更新；UI 与渲染不得直接改写位置。
- 感知输出是决策的唯一输入。决策模块不得访问 `world.entities` 真值、不得读取未进入感知范围的目标。
- 射线角度、量程、后向探测距离全部放入 `src/config`，不得散落魔法数字。
- 风险等级与 TTC 阈值以 `requirement.md` 的 SEN-06 为准；阈值调整需同步更新需求与测试。
- 传感器可视化读取同一份感知结果，禁止另算一套“展示数据”。

### 6.5 决策与控制

- 使用显式状态机：`CRUISE | FOLLOW | LANE_CHANGE | YIELD | STOP | TAKEOVER_REQUEST | MANUAL | FINISHED`。
- 状态迁移必须带守卫条件和退出动作；禁止在渲染层或 UI 事件里直接改状态。
- ACC 使用“目标距离 + 滞回区间”，禁止每帧在加速/刹车之间切换。
- AEB 优先级最高；触发后覆盖 ACC 与变道决策。
- 变道必须经过：触发 → 禁止区检查 → 目标车道前后安全检查 → 打灯 → 执行 → 中止/完成 → 冷却。
- 所有决策输出应附带原因码，供 HUD 与报告使用；原因码与文案分离。
- 手动输入与自动决策互斥；接管瞬间清空自动控制输出，避免“抢方向盘”。
- 评分逻辑必须是纯函数：输入遥测，输出分数与建议；不要依赖当前时间或全局状态。

### 6.6 配置与平衡

- 所有可调数值放入 `src/config/`：`balance.ts`（物理/评分阈值）、`levels.ts`（关卡）、`policies.ts`（策略）、`events.ts`（事件）。
- 配置使用 `readonly` / `as const`；运行时不得修改共享配置对象。
- 关卡与策略参数必须能追溯到 `requirement.md` 的表格；偏离时先改需求。
- 文案集中到 `src/ui/strings.ts`；不要在组件中散落中文硬编码，方便校对与后续扩展。

## 7. 代码与渲染约定

### 7.1 TypeScript

- `strict: true`，禁止 `any`；确实需要时用 `unknown` + 类型守卫。
- 不使用非空断言 `!` 掩盖可能为空的状态；用显式分支或断言函数。
- 领域对象使用 `readonly` 配置与窄类型；状态机使用判别联合或常量枚举。
- 模块保持单一职责，单文件建议不超过 400 行；超出时拆分。
- 导出优先使用具名导出；禁止循环依赖。
- 不写“万能工具函数”；数学、随机、存储分别放在 `core/` 下。
- 注释解释“为什么”，不重复“做了什么”；领域规则注释可中文，标识符用英文。
- 异常不得静默吞掉；存储/资源失败要有降级路径，并在开发环境输出明确错误。

### 7.2 Canvas 与 UI

- Canvas 只画世界层：道路、车道线、车辆、行人、障碍、传感器、特效。
- DOM 负责菜单、HUD、暂停、结算、设置、按钮与可访问文本。
- HUD 文本更新节流到 10 Hz；速度条、风险色块等高频元素可用 CSS 过渡，但不要每帧重排。
- Canvas 像素比上限 2；窗口尺寸变化时重算画布与相机，避免模糊和坐标错位。
- 使用 `ResizeObserver` / 视口变化处理尺寸；安全区用 CSS `env(safe-area-inset-*)`。
- 精灵、图标、车辆贴图预渲染到离屏画布；热循环内禁止创建渐变、阴影、滤镜和大对象。
- 单帧 Canvas 绘制调用控制在 300 以内；低频特效可合并或降级。
- 只有一条 `requestAnimationFrame` 循环；暂停或页面隐藏时停止循环，不要空转。
- 颜色使用色盲友好调色板；风险、模式、错误不能只靠红绿区分。
- 无外部字体；使用系统字体栈。中文正文在最小尺寸下不小于 12 px。
- 禁止使用会阻塞输入的 `alert/confirm` 做游戏内确认；用自定义弹层。

### 7.3 本地存储

- 键名统一前缀：`ads.v1.progress`、`ads.v1.settings`、`ads.v1.best`。
- 读写必须 `try/catch`；解析失败、版本不匹配、配额不足时回退内存态并提示。
- 数据结构带 `version` 字段；迁移函数集中管理，不散落在 UI。
- 只在对局结束、设置变更、解锁时写入；禁止每帧写入。
- 不存个人信息、设备标识、位置或任何可关联到人的数据。

### 7.4 性能实现

- 热循环内零分配：复用向量、临时对象池、对象池管理交通车辆与特效。
- 避免在物理/感知循环中使用 `map`、`filter`、展开运算符和闭包分配。
- 交通车辆与远景目标可池化；离开视野后回收，不无限增长。
- 感知只遍历附近实体；使用简单的空间分区或按车道分桶，避免全场景扫描。
- 渲染前做视口裁剪；不可见目标不绘制、不计算文字布局。
- 不在滚动/缩放时读取布局属性；HUD 更新与布局分离。
- 低端设备可降低粒子、阴影、传感器特效密度，但不得降低模拟频率或改变评分。
- 任何“优化”必须附性能对比；不要为了微优化牺牲可读性。

## 8. 测试与质量

### 8.1 单元测试

至少覆盖：

- 物理：加速、刹车、转向、边界、固定步长一致性。
- 感知：射线距离、遮挡、前车选择、风险阈值边界、后向探测。
- 决策：ACC 稳态与变速、AEB 触发/退出、变道触发/中止/冷却、路口停车、行人让行。
- 接管：触发条件、超时安全停车、交还条件。
- 评分：四项子分、权重、星级、碰撞封顶、确定性。
- 存档：正常读写、损坏数据、版本不匹配、存储不可用。
- 场景：公平生成约束、事件间隔、随机种子可复现。

测试数据使用固定种子与构造场景；不要依赖真实时间或随机顺序。核心模块行覆盖率目标 ≥ 80%。

### 8.2 端到端测试

用 Playwright 的移动视口至少覆盖：

1. 首次加载进入主菜单。
2. 选择第 1 关，完成/跳过教学，开始并暂停/恢复。
3. 手动越过道路边界（按碰撞处理）或其他碰撞，进入未通过结算。
4. 完成一局自动关卡，进入报告并检查核心字段。
5. 刷新页面后进度与最佳成绩保留。
6. 切换后台后返回，游戏处于暂停。
7. 首次加载后断网重开，仍可进入主菜单并游玩已解锁关卡。

### 8.3 手工回归

每轮发布前在 iOS Safari 与 Android Chrome 各 1 台真机检查：竖屏布局、触控、横屏提示、切后台、离线重开、声音开关、长时间稳定性。

### 8.4 提交前检查

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

四项全部通过才算完成。新增行为必须同步补测试；修复缺陷先写能复现的测试。

## 9. 性能预算

| 项目 | 预算 |
| --- | --- |
| 首次加载 JS + CSS | ≤ 250 KB gzip |
| 首次加载全部资源 | ≤ 2 MB，且无外部请求 |
| 中端设备帧率 | 平均 ≥ 55 fps，1% 低帧 ≥ 30 fps |
| 单帧 CPU | 常见场景 ≤ 8 ms |
| 主线程长任务 | 驾驶中无 > 100 ms |
| 输入响应 | ≤ 100 ms |
| 内存 | 10 分钟后 ≤ 200 MB，30 分钟增长 ≤ 20% |
| 结算 | 结束到报告可交互 ≤ 200 ms |
| 后台 | 停止循环，CPU 接近空闲 |

实现时优先保证模拟频率与输入响应，再降级视觉特效。任何性能回退都要用真机或浏览器性能面板对比，不以桌面高配机器为准。

## 10. 变更与文档规则

- `requirement.md` 是功能与验收的唯一依据；实现与需求冲突时先确认需求，不得“代码即需求”。
- `requirement.md` 中不得写入语言、框架、渲染技术、存储方案、部署平台等技术选型；技术决策只写在本文件。
- 新增或调整技术选型时，更新本文件的选型表、目录结构、命令与部署说明。
- `docs/draft.md` 只作为背景材料，不直接作为实现依据；不要修改它来“对齐”实现。
- 新增依赖、改变部署方式、增加服务端能力，必须先评审并同步两份文档。
- 需求编号（NAV/HUD/VEH/SEN/AI/TAK/POL/LVL/SCR/SAV/EDU/ENV/PF）在提交说明、测试名称与任务拆分中保持可追踪。
- 提交信息使用简洁的祈使句，说明“做了什么”；不混入无关格式化改动。

## 11. 完成定义（DoD）

一个功能完成需同时满足：

1. 对应需求编号已实现，行为与 `requirement.md` 一致。
2. 有单元测试或可复现的手工验收步骤；核心逻辑优先自动化。
3. `npm run typecheck`、`npm run lint`、`npm run test`、`npm run build` 全部通过。
4. 在 360×640 与 430×932 竖屏下无布局问题，真机触控可用。
5. 无新增控制台错误、无外部网络请求、无内存持续增长。
6. 离线重开、暂停恢复、切后台等边界未被破坏。
7. 若改变了数值或策略，已同步配置、测试与需求表格。
8. 相关文案为简体中文，且不出现未完成占位内容。

## 12. 已知边界

- 仅支持近两年主流 iOS / Android 移动浏览器；桌面端只保证调试可用。
- 仅简体中文、竖屏；横屏只提示旋转。
- 无账号、无云存档、无排行榜、无多人。
- 不模拟真实传感器硬件、不训练模型、不连接真实车辆。
- 游戏内智驾行为仅用于娱乐与教学演示，不代表真实自动驾驶能力；关于页需保留免责声明。
