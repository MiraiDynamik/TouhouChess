# Windows 上运行三秒永琳剪枝对局实验

## 测试内容

双方都调用 `engine/search.ts` 的 `timedMove`，使用永琳配置、每手 3000 ms。唯一实验差异是 `PRUNE.inner`：开启方为 1，关闭方为 0；该开关目前只启用 LMR。双方的根节点候选收窄、评估权重和规则相同。脚本只修改独立实验进程里的开关，不改源码或游戏默认设置。

- **香草组**：双方标准国际象棋阵容，43 点场上子力、2 点剩余弹药。
- **随机对称组**：每对生成一个随机阵容，黑方上下镜像白方。两盘使用完全相同的阵容，交换开启剪枝方的颜色。
- 默认每组 5 对换色，即各 10 局，总计 20 局。`--pairs 20` 表示每组 40 局，总计 80 局。
- 每对使用相同随机种子。所有走子都调用限时搜索，没有不计时的预走开局。
- 随机生成由 Python 提供候选顺序，Node 边界调用共用引擎的 `canDeploy` / `readySide` 验证；Python 不复制棋规。
- 随机组固定 e1 为王，其他位置随机填充，接受 30～45 点且不同的非香草阵容。由于八云紫存在已知首着问题且平衡暂缓，本实验不抽取她作为将军对象。此抽样不是所有合法阵容的均匀分布。

## Windows 首次准备

安装 Miniconda 和 Node.js（推荐 Node 22，至少 22.12），确保终端能运行 `conda`、`node`、`npm`。使用 **Miniconda Prompt** 最省事；PowerShell 的 `npm.ps1` 如果受执行策略限制，可使用 `npm.cmd`，不需要降低系统执行策略。

从 GitHub 克隆或拉取项目，然后进入项目根目录。首次运行：

```bat
conda env create -f environment.yml
conda activate TouhouChess
npm ci
node --version
python --version
```

如果已有 `TouhouChess` 环境：

```bat
conda env update -n TouhouChess -f environment.yml
conda activate TouhouChess
npm ci
```

无需 GPU/CUDA、浏览器或 DRF 服务。RTX 4070 不参与运算，Node 使用 CPU 执行同一 TS 引擎，Python 只负责阵容采样、实验调度、续跑和统计。不要使用系统 Python 或 base 环境。

## 先做快速检查

```bat
conda activate TouhouChess
npm run build
npm run test:all
python tests/test_timed_h2h.py
```

最后一个命令只用临时目录和 10 ms 搜索预算做协议、报告、续跑检查，不是棋力测试。所有临时结果会自动清理。

## 正式运行

推荐先用单进程，减少多局抢占 CPU 对墙钟限时的影响：

```bat
python -u lab/timed_h2h.py --pairs 5 --workers 1 --out lab/out/timed-h2h-3s
```

无需写 `--time-ms`，默认就是每手 **3000 ms**。该命令测试香草 10 局、随机对称 10 局。每盘最多 300 个半回合，即双方各走 150 步。

如希望在 i9 上同时跑两局，使用一个新结果目录：

```bat
python -u lab/timed_h2h.py --pairs 5 --workers 12 --out lab/out/timed-h2h-3s-w2
```

较大的批次：

```bat
python -u lab/timed_h2h.py --pairs 20 --workers 12 --out lab/out/timed-h2h-3s-80games
```

建议接电运行，避免同时玩游戏、跑其他 CPU 密集任务或开启本项目电脑自对弈。并发高不代表同一 3 秒内搜索更深；不要直接按逻辑核心数拉满并发。

**耗时估算**：若一盘走 100 个半回合且每手都用满预算，约 5 分钟；20 局串行约 100 分钟。单盘 300 半回合上限对应约 15 分钟，20 局串行预算总量约 5 小时，另有启动及保存开销。提前将杀/唯一候选可能少于预算。实际耗时取决于对局长度、硬件和系统负载。

脚本每 20 个半回合打印进度，每完成一局更新报告。不要从两个终端对同一输出目录同时启动实验。

## 停止和续跑

按 **Ctrl+C**。脚本会停止子进程并保留已完成的每一步，当前未完成的那次搜索下次重算。

重新执行**原来的完整命令**即可续跑：

```bat
python -u lab/timed_h2h.py --pairs 5 --workers 1 --out lab/out/timed-h2h-3s
```

- 已完成对局直接跳过；未完成对局从最近保存的棋盘与重复历史继续。
- `manifest.json` 保存阵容、种子、预算、并发等配置；`games/` 每局一个 JSON，保存局面、历史、逐步搜索深度/耗时与结果。
- 源码/权重/依赖锁文件摘要也会记录。参数或相关源码变化时拒绝混跑；新实验使用新的 `--out`。因此不要在同一个实验中途 `git pull` 更新引擎。
- 续跑的走法未必与完全不中断时逐步相同：JIT、温度和负载会改变 3 秒内完成的深度。已存档的走子不会重算。
- 强制关机或杀进程可能留下 `.running.lock`。确认该实验确实没有任何进程还在运行后，才手工删除输出目录内的此文件，再运行原命令。不要删除 `manifest.json` 或 `games/`。

## 输出报告

输出目录中包含：

| 文件 | 内容 |
|---|---|
| `report.md` | 人类可读报告：两组胜和负、纯胜率、得分率、未决与进度、配对描述性区间、实验条件 |
| `games.csv` | 每局结果、开启方颜色、阵容、平均搜索深度和耗时、前 8 个半回合 |
| `moves.csv` | 每一步的记谱、开关状态、深度、耗时与搜索分数 |
| `manifest.json` | 实验配置、阵容和运行环境 |
| `games/*.json` | 每局完整存档，用于续跑及复核 |
| `games/*.stderr.log` | Node 对局进程异常日志 |

CSV 使用 UTF-8 BOM，便于 Windows Excel 读取中文。报告里的胜负统一从**开启 LMR 的一方**看。

只重新生成报告，不继续下棋：

```bat
python lab/timed_h2h.py --summary --out lab/out/timed-h2h-3s
```

**统计口径**：

- 纯胜率 = 胜 / 自然结束局数。
- 得分率 =（胜 + 和 × 0.5）/ 自然结束局数。
- 将杀、逼和、三次重复和五十步由共用引擎判定。
- 达到 300 半回合仍未结束记为**未决**，不按子力判胜，也不冒充和棋。报告明确列出；未决较多时，已结束局的胜率可能存在选择偏差。
- 置信区间按完整换色配对重采样，只作描述。5 对样本非常少，区间可能退化，不能据此宣称显著强弱；包含 50% 也不等于证明两者相等。
- 时限是引擎定期检查的软限制，可能有少量超时；每步实际毫秒数会记录。

先看样本量、未决比例、开局重复程度，再看胜率。此实验不会自动开启游戏里的剪枝，也不决定合并开发者级与永琳。

## 推送和带回结果

将新增的 `cli/timed-match.mjs`、`lab/timed_h2h.py`、`tests/test_timed_h2h.py` 和本说明随仓库推送即可。脚本只依赖现有 npm 依赖与 Python 标准库，无新增依赖。

正式结果默认目录 `lab/out/timed-h2h*/` 已加入忽略列表，避免大型逐步存档意外进 Git。测试完可以把 `report.md` 和两个 CSV 发回来；需要复核或跨机器续跑时，将整个输出目录打包保存。跨硬件续跑会影响可比性，正式比较尽量在同一台机器完成。
