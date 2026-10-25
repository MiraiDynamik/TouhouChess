# 东方Project国际象棋

一个点数预算制的国际象棋变体：每方 45 分 / 16 身位，在五种部署位
（王位 后位 车位 轻子位 兵位）上自由组阵，然后对弈。

这个仓库是从一个单文件 HTML 原型重构来的。重构的理由和每个设计
决定背后的"为什么"写在代码注释里 —— 那些注释多半记录的是踩过的坑，
不是显而易见的事，所以值得读。

## 目录

目标应用栈是 **Python / Django REST Framework + Svelte 5 / Tailwind / Vite**。
前端组件使用普通 JavaScript；TypeScript 留给共用棋局引擎及其调用、测试边界。
助手负责主要实现，用户参与少量界面开发、sanity check 和架构决策。
Svelte 5 + Tailwind 界面已落地，DRF 业务后端尚未实现。

```
rules/      规则书与结构化棋子表（单一事实来源）
engine/     TypeScript 引擎，浏览器和批量测试共用同一份实现
            index.ts 是唯一公开入口，加导出就改那里
cli/        Node CLI：按规格打批量对局，吐 JSONL
lab/        Python：编排、统计、标定、调参 —— 在自己机器上跑的那一层
tests/      金标准与回归测试
web/        Svelte 5 + Tailwind + Vite（普通 JavaScript 组件）
            engine.mjs / engine.js 是构建出来的引擎产物，不要手改
```

**单一实现**：`engine/` 是唯一引擎实现。`npm run build` 从它生成浏览器产物和
可玩的 `touhou-chess.html`；主页面与分析 Worker 使用同一 bundle。
界面修改在 `web/src/`，生成文件不要手改，详见 `web/README.md`。

### 为什么引擎是 TS 而工具是 Python

引擎必须进浏览器，所以是 TypeScript，而且**只有一份实现** ——
两个语言各写一份引擎，早晚会像 Minecraft 基岩版和 Java 版一样无法同步。

研究与实验编排使用 Python：`lab/*.py` 起 Node 子进程打对局、收 JSONL、
做统计和参数搜索。所以调参、标定、训练都是 `python lab/xxx.py`，
只需要机器上有 Node，不需要写 JS。

### cost 和 value 是两个数

```
cost    部署花费。规则，玩家可见，必须等于规则书。  → rules/pieces.toml
value   引擎估价。默认等于 cost，标定时独立变动。    → engine/weights.json
```

原型里这是同一个字段，而这个二义性制造过一整夜的错误结论：
"把被测棋子按被替换棋子的价格注册"同时改了预算和引擎的判断，
两个效应缠在一起分不开。拆成两个数之后才能分别问：

- `value` 调高、`cost` 不变 → 引擎正确对待这个棋子之后它到底多强
- `cost` 和 `value` 一起调高 → 这个棋子该不该涨价

## Python 独立环境

本项目使用 Miniconda 环境 `TouhouChess`（Python 3.12），不使用系统 Python 或 base。

```sh
conda env create -f environment.yml  # 仅首次创建
conda activate TouhouChess
python --version
```

直接运行研究脚本前先激活；也可以使用 `conda run -n TouhouChess python lab/accept.py`。
`npm` 中的 Python 任务已显式绑定此环境。Python 工具目前仅使用标准库。

## 常用命令

```bash
# 规则书 → 结构化表 → 生成引擎的 cost 表 → 比对实现
npm run rules

# 金标准（重构的安全网，305 项）
npm test

# 浏览器用的引擎产物 + 对产物跑同一套断言
npm run build:engine && npm run test:bundle

# 开发者级验收 —— 跑任何测量之前先过这一关
conda run -n TouhouChess python lab/accept.py

# 等时对局：剪枝方多搜一层 对 精确方。判剪枝值不值
npm run h2h

# 加 import（新增模块后不用手写 import 列表）
conda run -n TouhouChess python lab/fiximports.py
```

## 两个引擎级别

| | 键 | 用途 | 标准 |
|---|---|---|---|
| **贤者级** | `eirin`（永琳） | 面向玩家的对手 | 只看胜率最高，允许手写启发式 |
| **开发者级** | `dev` | 研究阵容与子力的**测量仪器** | 不必最强，但设计必须正确 |

玩家能选的四档按东方的分级命名：`cirno`（琪露诺，妖精级）、
`rinnosuke`（霖之助，人类）、`patchouli`（帕秋莉，魔法使级）、
`eirin`（永琳，贤者级）。旧键 `baka/human/youkai/sage` 仍然可用。

两级合并的条件写在 `RUN.md` 第 0 项：等时对局证明剪枝后的深度够用，
且开局五项不再是 `dev` 和 `eirin` 的区别，才能合。

开发者级只保留全程生效、从棋子几何推导的评估项（子力 + 机动性 +
王安全 + 残局将杀驱动），不含手写的开局原则项。

理由是实测的：开局原则项里的"重子早出扣分"一项，在香草阵容上
**+21.7pp**、在灵梦三枚阵容上 **−20.0pp**（两者都显著，n=60/80）。
拿一把偏差随阵容翻转的尺子去给阵容排名，量到的是偏差不是阵容。

开发者级的入口只有 `devMove(s, 额外深度)` 一个函数，它内部关掉那些项
再还原 —— 不是为了封装，是因为"每个研究脚本自己记得关"会漏，
而漏掉一次就是一组看着正常、实际带 ±20pp 偏差的数据。

## 验收标准：仪器先于测量

```
白方 = 香草少 k 个兵，黑方 = 整副香草，其余完全相同
两边都没有打入手，所以省下的弹药花不出去 —— 这是真让子
```

要求：k=0 时约 50%（无颜色偏差）、少 1 个兵显著低于 50%、少 3 个兵更低。

深度 2 在这一关**不及格**：少 1/2/3 个兵给出 47.5 / 48.3 / 47.3%，
毫无趋势。少三个兵接近必败，而仪器读不出来 —— 这是最便宜的健全性检查，
却是整个项目里最晚做的一个。之前约六千局的子力标定因此全部作废。

## 已知待决

`rules/open_questions.toml` 列着等人裁决的规则书↔实现差异。
列在那里的项目：比对工具照样打印，但不算失败（否则检查永远是红的，
真正的回归就看不见了）；生成器保留**当前实现**的行为，不擅自采用
规则书那一侧 —— 否则"等人裁决"会变成"工具悄悄替人决定了"。

## 可玩的界面

开发时运行 `npm ci`、`npm run dev`，打开终端显示的地址（默认 http://127.0.0.1:5173/）。
Svelte 组件在 `web/src/components/`；页面布局在 `web/src/App.svelte`，
颜色字体在 `web/src/tokens.css`，少量交互逻辑在 `web/src/game.js`。

`npm run build` 同时生成 `web/dist/` 网站和可独立打开的 `touhou-chess.html`。
两个入口都是同一 Svelte 应用、同一 TS 引擎，不存在第二套手写 HTML 界面。

保留部署、四档 AI、中英切换、悔棋、升变/打入选择、双线程分析及原有外观。
分析持续迭代加深，对局 AI 使用独立 Worker 和时间预算。开发者级与永琳仍独立保留。

`npm run test:all` 包含生成物逐字节检查、源码和产物各 305 项金标准、
界面会话与真实 Worker 集成测试。详细结构见 `web/README.md`。

## 电脑走棋预算

琪露诺目标 3 层 / 最多 0.5 秒，霖之助目标 4 层 / 最多 1 秒，帕秋莉目标 5～7 层 / 最多 2 秒；原有失误率保持。永琳每手预算 3 秒，不设固定深度上限，采用最后完整迭代的结果（发现将杀或仅剩候选时可提前结束）。计时在搜索中定期检查，因此预算不是硬实时保证；Worker 启动另有少量开销。

搜索和难度配置均在 `engine/search.ts`。`web/src/bot.worker.js` 仅传递消息。悔棋、重新部署、切换电脑执方/难度都会终止旧搜索并丢弃迟到结果。Worker 不可用时提示失败，不回退到阻塞界面的深搜。

研究用固定深度 API 仍保留；默认深度提高后，历史实验应显式指定原来的 fixedDepth 以保持可比。开发者级固定深度默认提高为 4～6 层，两种评估模式仍未合并。
