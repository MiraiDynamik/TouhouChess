# 项目约束

用户明确要求：浏览器 HTML 与 TypeScript 引擎从此必须严格使用同一实现。

- `engine/` 是唯一可维护的规则、评估、搜索实现。
- 禁止在界面、Worker、Python 工具中复制或另写引擎逻辑。
- `web/engine.js`、`web/engine.mjs`、`touhou-chess.html` 只能用 `npm run build` 生成。
- 页面源码在 `web/src/`（Svelte 5 + 普通 JavaScript）；页面与分析 Worker 通过 `web/src/engine.js` 导入同一 TS 引擎，不能维护另一份实现。
- 修改引擎、权重、模板、构建脚本后，运行 `npm run build && npm run test:all`。
- 不得通过改写金标准来掩盖回归。规则变更需要用户授权，并单独解释基准变动。
- 八云紫平衡暂缓；开发者级与永琳合并需研究证据和用户决定，不自行合并。
- `archive/` 仅为交接前原型备份，禁止作为开发、运行或测试入口。

## Python 环境

- 本项目必须使用 Miniconda 的同名独立环境 `TouhouChess`，禁止使用系统 Python 或 base 环境执行项目脚本。
- 运行方式：`conda run -n TouhouChess python ...`，或先 `conda activate TouhouChess`。
- 环境定义在 `environment.yml`；新增 Python 依赖也必须安装到此环境并记录。

## 技术栈与协作分工

- 用户的技术栈是 Python、Django REST Framework（DRF）、Svelte 5、Tailwind CSS。应用开发必须采用这一栈，便于用户 sanity check 和作架构决策。
- 用户只参与少量界面开发，不负责大部分实现，也不会 TypeScript。不能把“界面归用户”当作留下未实现功能的理由；助手负责完成实现，用户可以修改界面和设计。
- 用户参与界面的主要原因是避免 AI 界面外观趋同：用户会在一定程度上控制视觉外观，也会修改少量前端逻辑。保留其设计选择和手工修改，不擅自套用统一模板或覆盖；组件、样式与事件逻辑应清晰易改，不能将用户的参与限定为仅改颜色字体。
- 正式前端使用 Svelte 5 + Tailwind + Vite，组件使用普通 JavaScript，不要求用户编写 TS。Tailwind 类放在组件中，颜色、字体等设计变量集中管理。
- 应用后端采用 Python + Django REST Framework；研究、批量实验、统计、标定和调参工具使用 Python。不得擅自换成 Node 业务后端或其他框架。
- TS 的例外范围是棋局引擎及必要的引擎 CLI/测试边界；引擎由助手维护。浏览器、Worker、研究工具复用同一实现，不为使用 Python 而重写引擎。
- Python 通过薄的 Node CLI 调用引擎，JSON 输入、JSONL 输出；交互式局面探索主要在浏览器完成，不另建 Python 棋局引擎。
- 评估参数通过数据文件调整，区分规则价格 cost 与引擎估价 value；用户继续提供 Markdown 规则，工具负责结构化转换和一致性检查。
- Svelte 5 + Tailwind 界面已落地；根目录 HTML 是同一应用的生成物。DRF 业务后端尚未实现，不虚报框架落地。
