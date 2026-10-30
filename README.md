# AI 智驾模拟器

移动端竖屏小游戏：观察虚拟智驾系统完成感知、决策与控制，必要时接管，结束后查看智驾评分报告。纯静态、可离线游玩。

## 快速开始

```bash
npm install
npm run dev        # 本地开发 http://127.0.0.1:5173
npm run build      # 类型检查 + 构建到 dist/
npm run preview    # 预览构建产物
```

## 质量检查

```bash
npm run typecheck
npm run lint
npm run test       # Vitest 单元测试
npm run test:e2e   # Playwright 冒烟测试
```

## 部署

构建产物为 `dist/`，通过 Cloudflare Workers Static Assets 发布：

```bash
npx wrangler dev     # 本地验证
npm run deploy       # 构建并部署
```

## 技术栈

TypeScript + Vite 7 + Canvas 2D + 原生 DOM，无运行时框架、无后端、无外部接口。

## 文档

| 文档 | 内容 |
| --- | --- |
| `requirement.md` | 功能与验收的唯一依据 |
| `AGENTS.md` | 技术选型与工程约定 |
| `docs/features/` | 12 个功能点拆分 |
| `docs/assets/` | 素材规格与替换流程 |
