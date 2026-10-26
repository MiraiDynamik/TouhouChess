# Svelte 5 前端

本文中的命令在项目根目录执行，表格中的 `src/` 均指 `web/src/`。返回 [开发文档目录](README.md)。

界面使用 Svelte 5 + Tailwind CSS 4 + Vite，所有组件和界面逻辑均为普通 JavaScript。
迁移保留原有配色、字号、布局、棋子符号和功能，便于之后逐步调整外观。

## 运行

```sh
npm ci
npm run dev
```

打开终端显示的本机地址（默认 http://127.0.0.1:5173/）。修改 Svelte/CSS 后自动热更新。
无需启动 Python；本次是界面迁移，没有添加业务后端。

## 修改入口

| 文件 | 用途 |
|---|---|
| `src/App.svelte` | 页面布局、部署/对局工具栏、电脑设置、记谱 |
| `src/components/Board.svelte` | 棋盘、高亮、升变/打入选择 |
| `src/components/Palette.svelte` | 棋子分类和选择面板 |
| `src/components/Piece.svelte` | 棋子符号 |
| `src/components/AnalysisPanel.svelte` | 双引擎分析开关和结果展示 |
| `src/tokens.css` | 全局颜色、字体 |
| `src/app.css` | 保留的棋盘效果和细节样式；布局用组件中的 Tailwind 类 |
| `src/game.js` | 界面会话、点击、悔棋、电脑回合调度 |
| `src/i18n.js` | 中英文文案 |
| `src/analysis.js` | Worker 生命周期与主线程回落调度 |

## 同一份引擎

`src/engine.js` 是前端唯一的引擎入口：导入 `engine/index.ts` 并装载权重。
界面和 `src/analysis.worker.js` 都走此入口。Worker 只有消息协议，不实现搜索。
部署约束和分析搜索分别在 `engine/deploy.ts`、`engine/search.ts`；CLI 和浏览器共用。

两个分析面板各用独立 Worker，持续加深直到关闭或局面改变。走子、悔棋、重新部署和
组件卸载都会终止旧线程。Worker 不可用时保留限时主线程回落；对局 AI 使用独立 Worker 和时间预算。
语言切换与翻转不重启分析。重复局面历史在开始、走子、悔棋时同步到共用引擎。

## 构建与检查

```sh
npm run build
npm run test:all
```

- `web/dist/`：可部署的静态网站，`npm run preview` 可预览。
- 根目录 `touhou-chess.html`：同一 Svelte 应用打包成单文件，包含样式、引擎、权重和 Worker。
- `web/engine.mjs` / `web/engine.js`：供其他入口使用的引擎产物。

所有产物都由 `npm run build` 生成，禁止手改。`npm test` 首先重新编译到内存，
逐字节核对两个引擎产物和单文件 HTML；源码、权重或组件改后没重新构建会失败。
Tailwind 只扫描 Svelte 源文件，不扫描生成物，保证构建可重复。

源码与 ESM 各跑 305 项金标准。集成测试覆盖实际会话操作、部署限制、重复/悔棋、
升变、爱丽丝打入，以及真正独立线程中运行的 Worker 入口。
`archive/` 仅为历史备份，不参与构建、运行或测试。

## 电脑走棋预算

琪露诺目标 3 层 / 最多 0.5 秒，霖之助目标 4 层 / 最多 1 秒，帕秋莉目标 5～7 层 / 最多 2 秒；原有失误率保持。永琳每手预算 3 秒，不设固定深度上限，采用最后完整迭代的结果（发现将杀或仅剩候选时可提前结束）。计时在搜索中定期检查，因此预算不是硬实时保证；Worker 启动另有少量开销。

搜索和难度配置均在 `engine/search.ts`。`web/src/bot.worker.js` 仅传递消息。悔棋、重新部署、切换电脑执方/难度都会终止旧搜索并丢弃迟到结果。Worker 不可用时提示失败，不回退到阻塞界面的深搜。

研究用固定深度 API 仍保留；默认深度提高后，历史实验应显式指定原来的 fixedDepth 以保持可比。开发者级固定深度默认提高为 4～6 层，两种评估模式仍未合并。
