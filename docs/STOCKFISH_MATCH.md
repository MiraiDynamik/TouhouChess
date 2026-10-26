# 开发者引擎对战 Stockfish

目标玩家是碰巧会国际象棋的东方爱好者，先围绕 1500 限强档位摸底，不以 GM 强度为目标。这轮测试的是开发者引擎，不是永琳；不能直接把结果归给永琳。

`lab/stockfish_match.py` 使用 Python 标准库调度，通过 `cli/stockfish-bridge.mjs` 调用 `engine/` 中唯一的规则和搜索实现。开发者启用 futility + LMR，不改变游戏默认设置。

本机通过 Homebrew 安装 Stockfish 19，路径 `/opt/homebrew/bin/stockfish`；查询 UCI 得到支持的 `UCI_Elo` 范围为 1320–3190。Stockfish 限强档位不是平台等级分，固定每手 3 秒的实验也不能直接换算真人 Elo。

## 运行与续跑

在项目根目录运行：

```sh
conda run --no-capture-output -n TouhouChess python -u lab/stockfish_match.py
```

默认 1320、1500 两档，各两对换色，共 8 局；双方每手 3 秒，香草标准起始阵容，同时一局。Stockfish 单线程、64 MB Hash；开发者搜索单线程。需要已执行 `npm ci`，不新增 Python 依赖。

Ctrl+C 停止，运行相同命令续跑。每半回合原子保存，完成的对局自动跳过。源码、参数和 Stockfish 二进制摘要必须一致；修改后用 `--out` 指定新目录。意外断电留下 `.running.lock` 时，先确认没有对局进程，再删除锁文件。不要在同一目录同时启动两份实验。

可用参数：`--stockfish 路径`、`--elos 1320 1500`、`--pairs 2`、`--time-ms 3000`、`--max-ply 300`、`--out 目录`。

## 结果

默认输出 `lab/out/stockfish-dev-3s/`（不自动提交 Git）：

- `report.md`：各档胜和负、得分率、未决数。
- `games.csv`：逐局结果、半回合数、开发者平均完成深度。
- `game-*.json`：逐半回合 UCI 走法、深度、耗时及可恢复记录。
- `manifest.json`：实验参数及源码、Stockfish 身份。

报告在每 20 半回合、终局及正常退出时更新。达到 300 半回合算未决，不算和棋；采用项目已有将杀、逼和、三次重复、50 回合判定，不额外引入子力裁决或死局检测。

每档四局只能作为摸底，不能给出可靠 Elo 估值；重复标准起始阵容也不能代替多样开局。Stockfish 限强有随机性，续跑清空其置换表，后续走法可能改变。找到接近五五开的档位后，再决定是否扩大样本。

## 验证

```sh
conda run -n TouhouChess python tests/test_stockfish_match.py
```

通过 Stockfish `go perft 1` 对照 120 个局面的完整合法走法集合，包含易位、吃过路兵、升变开头；另外验证将杀、续跑、完成局跳过、参数变化拒绝、报告输出。测试默认使用本机 Stockfish 路径。

## 四档难度试玩标定（新增）

用户目标参照为 Chess.com 约 10 分钟快棋：Easy 约 200，Normal 600–700，Hard 1000–1200，Lunatic 不设上限。Stockfish 19 的最低 UCI_Elo 为 1320，不能直接提供上述三个低分档的等价对手；它只作为统一参照和走法诊断工具。

`--level easy|normal|hard|lunatic` 选择本方难度；`--native-time` 保留游戏内预算（0.5/1/2/3 秒），`--time-ms` 此时仅设置 Stockfish 预算。每局开始清空双方缓存，续跑也清空；同一局中保留缓存。与旧协议使用不同输出目录。对局适配器对相邻每手种子先混合再生成随机数，防止随机失误集中在连续回合。

本次正式摸底输出到 `lab/out/stockfish-difficulties-v3/`，四档各与 1320 对手进行一对换色，共 8 局，最多同时 4 局，各进程单线程。v2 是发现种子相关性后中止的无效试跑，不用于结论。

示例（将 easy 替换成其他档位）：

```sh
conda run --no-capture-output -n TouhouChess python -u lab/stockfish_match.py --level easy --native-time --elos 1320 --pairs 1 --out lab/out/stockfish-difficulties-v3/easy
```

完成后复查：

```sh
conda run --no-capture-output -n TouhouChess python -u lab/stockfish_review.py lab/out/stockfish-difficulties-v3
```

复查使用未限强 Stockfish，每局面固定 50000 节点；输出 review.md、review.csv、review.json。仅在落子前绝对评分不超过 400 cp 的局面汇总走法损失，强制将杀另计。不同档位面对不同局面，不能直接用平均损失转换 Elo；每档两局也不能证明具体平台分数。当前不自动调整游戏参数。

## 当前 Hard 复测（2026-10-25）

输出目录 `lab/out/hard-calibration-v4/`：当前 Hard 概率 0/1/20/79%，每手 2 秒，棋盘剩余 ≤18 枚时取消深度上限。对手 Stockfish 19 UCI_Elo=1320，每手 3 秒、单线程、64 MB Hash。两批各一对换色，并行两局，共四局。`source/` 保存本轮引擎和调度脚本快照；不混入此前难度配置结果。

`--start-pair` 指定起始配对编号，同时区分随机种子，可将不同编号的批次放入不同目录并行运行。例如：

```sh
conda run --no-capture-output -n TouhouChess python -u lab/stockfish_match.py --level hard --native-time --elos 1320 --pairs 1 --start-pair 1 --out lab/out/hard-calibration-v4/batch1/hard
conda run --no-capture-output -n TouhouChess python -u lab/stockfish_match.py --level hard --native-time --elos 1320 --pairs 1 --start-pair 2 --out lab/out/hard-calibration-v4/batch2/hard
```

两条命令可在不同终端运行。已完成局自动跳过；源码校验仍生效。四局只作初步诊断，不能将对 SF1320 的得分直接换成 Chess.com 快棋 Elo。这里只能测标准香草阵容。

## 永琳上限与自定义棋子参考价值（2026-10-25）

输出目录 `lab/out/eirin-ceiling-v1/`，测试当前 Lunatic（无主动随机失误、3 秒预算、不限深度、默认剪枝与 TT），不修改引擎或默认配置。先测 SF19 限强 1500、1700 各一对换色，见到 1700 胜局后增加 1900 一对；标准香草阵容，SF 每手也为 3 秒。使用不同配对编号 1/2/3，最多三局并行。

复盘脚本：

```sh
conda run --no-capture-output -n TouhouChess python -u lab/stockfish_audit.py lab/out/eirin-ceiling-v1
conda run -n TouhouChess python tests/test_stockfish_audit.py
```

未限强 SF 每局面 100000 节点初查，损失≥100 cp或涉及强制将杀的候选用 1000000 节点复查，保留推荐走法与主变化。按落子原子保存 audit-game-*.json，重复运行会复用同一棋谱及参数的已审查记录；正在进行的对局跳过。汇总为 audit.json、audit.md、audit.csv。有限节点分析仍有误差，尤其不得把不同节点预算的 mate 消失自动当成棋理证明。

自定义棋子稳定性脚本：

```sh
conda run --no-capture-output -n TouhouChess python -u lab/variant_stability.py
```

四个现有规则回归局面（灵梦、琪露诺冻结、爱丽丝打入、恋）分别测试机器人 3 秒、15 秒及分析面板算法 15 秒，调用共享 TS 引擎，冷缓存、同一随机种子。这里只检验推荐和评分随搜索预算/入口的变化，不能独立验证规则或子力价值；默认棋子 value 仍等于规则 cost。分析入口全根候选逐层搜索，与机器人根候选收窄路径不同，层数不能直接比较。结果在 variant-stability.json。
