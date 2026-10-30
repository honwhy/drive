# 素材总览与规范（Assets Index）

> **项目简报**：《AI 智驾模拟器》是手机竖屏、单人、可离线游玩的智驾观察小游戏。玩家观察虚拟智驾系统完成感知、决策与控制，必要时接管，结束后查看评分报告。视角为俯视/斜俯视，本车固定在画面下方约 70%，车头朝上。风格为扁平化 + 轻微立体，主色蓝 `#2F6FDC`、橙 `#F2994A`，色盲友好；仅简体中文；全部素材必须本地化、离线可用、无外链。

本目录存放**素材需求文档**，一份文档对应一个素材。实际文件放在 `public/media/` 与 `public/icons/`，当前均为 **0 字节占位文件**，替换同名文件即可生效，无需改代码或文档。

## 1. 目标设备与画布换算

| 项目                 | 数值                                                     |
| -------------------- | -------------------------------------------------------- |
| 基准机型             | iPhone 16 Pro                                            |
| 逻辑分辨率（CSS px） | 402 × 874                                                |
| 物理分辨率 / DPR     | 1206 × 2622 / 3                                          |
| 游戏画布像素比上限   | 2（`src/config/balance.ts` 的 `RENDER.maxPixelRatio`）   |
| 实际渲染画布         | 804 × 1748 px                                            |
| 兼容尺寸             | 360×640、390×844、430×932（等比缩放，素材按 2 倍图输出） |
| 安全区               | 顶部约 62 pt、底部约 34 pt（Dynamic Island 机型）        |

**结论：除特别说明外，图片一律按“显示尺寸 × 2”输出 2 倍图。** 3 倍图仅在总体积预算内才使用；超过 2 倍不会带来可见收益（渲染上限 2 倍）。

## 2. 通用规则

### 2.1 图片

- 格式：PNG-24（带 Alpha），sRGB，无隔行扫描；不含 EXIF、不含 ICC 嵌入以外的元数据。
- 透明边缘：图形四周留 2 px 透明安全边，避免缩放时被裁切。
- 方向：车辆、行人一律**车头/正面朝上**（+y 方向）；渲染层不做旋转镜像，靠朝向旋转。
- 光影：光源固定在左上，阴影可烘焙进 PNG，但不得使用大面积高斯模糊。
- 描边：深色底与浅色底都要能辨认；线宽 ≥ 2 px（2 倍图）。
- 单文件体积预算：见各素材文档；全部图片合计 ≤ 1.4 MB。
- 禁止：外链、字体文字写进图片（文案由 UI 渲染）、水印、真实品牌车标、真人照片。

### 2.2 音频

- 容器/编码：`.m4a`（MP4 容器 + AAC-LC），手机浏览器原生支持，无需解码库。
- 采样率：48 000 Hz；声道：单声道（SFX）。
- 位深：源文件 24-bit，导出 AAC-LC 96 kbps VBR。
- 响度：−16 LUFS（整体），真峰值 ≤ −1 dBTP；短促提示音可 −14 LUFS。
- “帧率”说明：音频无视频帧率；本项目以**采样率 48 kHz + AAC 帧长 1024 samples（≈21.3 ms）** 作为帧参数，导出时不得改变采样率。
- 循环素材：首尾必须零交叉、无静音填充，循环点误差 ≤ 5 ms；文件内不得含 2 个以上连续静音段。
- 单文件时长上限：SFX ≤ 2.5 s；提示音 ≤ 3 s。
- 禁止：人声采样、真实车辆录音、版权音乐、外部音源链接。

## 3. 素材清单

### 3.1 图片（15）

| 文件                                                | 用途           | 输出尺寸（px）              | 显示尺寸（CSS px） | 关联功能    | 文档                                                       |
| --------------------------------------------------- | -------------- | --------------------------- | ------------------ | ----------- | ---------------------------------------------------------- |
| `public/media/images/vehicles/vehicle-ego.png`     | 本车           | 64 × 160                    | 32 × 80            | F03 车辆    | [vehicle-ego.md](image/vehicle-ego.md)                     |
| `public/media/images/vehicles/vehicle-sedan.png`   | 同向轿车       | 60 × 144                    | 30 × 72            | F03 车辆    | [vehicle-sedan.md](image/vehicle-sedan.md)                 |
| `public/media/images/vehicles/vehicle-suv.png`     | 同向 SUV       | 68 × 160                    | 34 × 80            | F03 车辆    | [vehicle-suv.md](image/vehicle-suv.md)                     |
| `public/media/images/vehicles/vehicle-truck.png`   | 货车           | 76 × 240                    | 38 × 120           | F03 车辆    | [vehicle-truck.md](image/vehicle-truck.md)                 |
| `public/media/images/actors/pedestrian-sheet.png`  | 行人 2 帧      | 112 × 96（2 × 56 × 96）     | 56 × 96            | F04 感知    | [pedestrian-sheet.md](image/pedestrian-sheet.md)           |
| `public/media/images/props/cone.png`               | 锥桶           | 32 × 32                     | 16 × 16            | F04 感知    | [cone.md](image/cone.md)                                   |
| `public/media/images/props/barrier.png`            | 施工围挡       | 96 × 240                    | 48 × 120           | F04 感知    | [barrier.md](image/barrier.md)                             |
| `public/media/images/road/road-asphalt-tile.png`   | 沥青平铺纹理   | 256 × 256                   | 128 × 128 平铺     | F03/F05     | [road-asphalt-tile.md](image/road-asphalt-tile.md)         |
| `public/media/images/ui/menu-hero.png`             | 主菜单背景     | 804 × 1748                  | 402 × 874          | F01 导航    | [menu-hero.md](image/menu-hero.md)                         |
| `public/media/images/ui/level-cards-sheet.png`     | 7 张关卡缩略图 | 640 × 2380（7 × 640 × 340） | 320 × 170          | F08 关卡    | [level-cards-sheet.md](image/level-cards-sheet.md)         |
| `public/media/images/ui/risk-icon-sheet.png`       | 风险 4 级图标  | 256 × 64（4 × 64 × 64）     | 32 × 32            | F02 HUD     | [risk-icon-sheet.md](image/risk-icon-sheet.md)             |
| `public/media/images/ui/control-buttons-sheet.png` | 4 个操控按钮   | 512 × 128（4 × 128 × 128）  | 64 × 64            | F02/F06/F11 | [control-buttons-sheet.md](image/control-buttons-sheet.md) |
| `public/media/images/ui/star-sheet.png`            | 空星/实星      | 96 × 48（2 × 48 × 48）      | 24 × 24            | F09 评分    | [star-sheet.md](image/star-sheet.md)                       |
| `public/icons/app-icon-512.png`                     | 应用图标       | 512 × 512                   | 系统图标           | F01/F12     | [app-icon.md](image/app-icon.md)                           |
| `public/icons/app-icon-maskable-512.png`            | 可遮罩图标     | 512 × 512                   | 系统图标           | F01/F12     | [app-icon.md](image/app-icon.md)                           |

### 3.2 音频（8）

| 文件                                         | 用途         | 时长       | 关联功能 | 文档                                                 |
| -------------------------------------------- | ------------ | ---------- | -------- | ---------------------------------------------------- |
| `public/media/audio/sfx-ui-click.m4a`       | 按钮点击     | ≤ 0.12 s   | F01/F11  | [sfx-ui-click.md](audio/sfx-ui-click.md)             |
| `public/media/audio/sfx-countdown.m4a`      | 3-2-1 倒计时 | ≤ 3 s      | F01      | [sfx-countdown.md](audio/sfx-countdown.md)           |
| `public/media/audio/sfx-takeover-alert.m4a` | 接管请求循环 | 1.2 s 循环 | F06      | [sfx-takeover-alert.md](audio/sfx-takeover-alert.md) |
| `public/media/audio/sfx-aeb.m4a`            | AEB 触发     | ≤ 0.8 s    | F05/F06  | [sfx-aeb.md](audio/sfx-aeb.md)                       |
| `public/media/audio/sfx-collision.m4a`      | 碰撞         | ≤ 1.2 s    | F03      | [sfx-collision.md](audio/sfx-collision.md)           |
| `public/media/audio/sfx-turn-signal.m4a`    | 转向灯节奏   | 0.6 s 循环 | F05      | [sfx-turn-signal.md](audio/sfx-turn-signal.md)       |
| `public/media/audio/sfx-report.m4a`         | 结算出现     | ≤ 2.5 s    | F09      | [sfx-report.md](audio/sfx-report.md)                 |
| `public/media/audio/sfx-warning.m4a`        | 危险等级提示 | ≤ 0.6 s    | F02      | [sfx-warning.md](audio/sfx-warning.md)               |

## 4. 替换与校验流程

1. 用同名文件覆盖 `public/` 下的 0 字节占位文件，保持文件名、格式、尺寸不变。
2. 图片用 `file`/属性确认尺寸与格式；音频确认采样率 48 kHz、编码 AAC-LC。
3. `npm run build` 后检查 `dist/assets/` 与 `dist/icons/` 内文件已被复制。
4. 启动 `npm run preview`，在 402×874 视口下确认素材清晰、无锯齿、无拉伸。
5. 首次加载资源总量仍须 ≤ 2 MB（`requirement.md` PF-06）。
6. 素材缺失或损坏时，代码必须回退到几何占位图形，不得白屏或崩溃。
