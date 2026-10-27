# 妖精固定交换实验：两种情况各500对

这是新实验入口 `lab/fairy_exchange.py`，旧 `piece_value.py` 保留供60局试跑的分析和复现。两组均使用双方永琳、妖精先验1.5、每手3秒、固定弹药各2、上限400 ply；达到上限记未决，不按评分裁胜。不测试恋，不改变游戏默认参数。

## Windows 运行

项目根目录执行：

```powershell
conda activate TouhouChess
npm ci
python lab/fairy_exchange.py
```

默认12 workers，**每组500对换色、1000局，总计2000局**。默认输出 `lab/out/fairy-exchange-2000/`，已由 `.gitignore` 的 `lab/out/` 规则忽略。

只生成阵容与校验计划，不运行对局：

```powershell
python lab/fairy_exchange.py --plan
```

去掉 `--plan` 即开始。同目录 Ctrl+C 停止后，重新执行原命令续跑。已结束的局跳过，未结束的局从最后保存的 ply 继续；进程内置换表不会恢复。可以改变 `--workers`，其他配置、源码、Node版本需一致；新实验不要指向旧 fairy-pilot 目录。

如需分别执行：

```powershell
python lab/fairy_exchange.py --groups pawns --out lab/out/fairy-pawns-1000
python lab/fairy_exchange.py --groups knight --out lab/out/fairy-knight-1000
```

每条都是500对1000局；默认单条命令已包含这两组，不能再把它们当作缺失的任务重复运行。默认总共12 workers，若同时启动两个单组命令，并发数会相加。

## 两种情况

| 组名 | 妖精方 | 对照方 |
|---|---|---|
| pawns | 香草阵容三个兵位换为两枚异色妖精和一空位 | 完整香草阵容 |
| knight | b1/g1 两马都换成妖精 | 随机删 b1 或 g1 一马，留空 |

格名按本方白视角，执黑时上下镜像。每对使用同一阵容和搜索随机种子，仅交换执色；不同对使用不同种子。不强制开局，不额外随机走棋，因此某些局可能重复。

兵组有4×4×6=96种布局，按种子打乱后均衡循环；500对时每种5或6对。马组只有两种布局，随机排序、每种250对。两组交错排队，避免暂停时只跑完第一组。

500对是对局重复数，**不是500个独立开局**。尤其马组只有两个初始模板，限时搜索的不同结果不能等同于新增独立位置样本。程序报告实际布局覆盖，不声称由重复局得到精确的棋子价值置信区间。

## 输出与并发保护

- `manifest.json`：两组计划、阵容、参数和源码身份。
- `games/*.json`：逐手检查点、完整走法和搜索数据。
- `games/*.pgn`：每局结束后的仙灵扩展棋谱，可导入本游戏复盘。
- `report.md`、`summary.csv`：分组胜和负、未决、得分率和配对完成度。
- `games.csv`：逐局结果、布局、执色、长度和平均深度。

胜负都从妖精方计。得分率=(胜+0.5×和)/已决局数；完整配对得分范围将未决按全负和全胜分别计算，不是置信区间。两组不混合拟合单枚兵值。

各worker只写自己的棋局；报告由主线程写。复用上一轮修正的PID临时文件和Windows占用重试。运行、汇总、PGN导出共用目录锁：先停止运行再执行单独汇总或转换。

```powershell
python lab/fairy_exchange.py --summary
python lab/fairy_exchange.py --export-pgn
```

长测试中不要更新源码。锁文件异常残留时，确认该目录没有运行进程后再移除 `.running.lock`。JSON是续跑依据，不要删除。

`.gitignore` 不会自动取消历史文件的Git跟踪；此次不移除仓库里已跟踪的旧研究结果，新实验数据不入库。

## 开发验证

```powershell
python -m unittest discover -s tests -p test_fairy_exchange.py
```

测试校验全部2000局阵容、异色与子力差、500对布局均衡、随机种子可复现、换色一致，以及12 workers短局、完成跳过、报告/PGN生成、配置变更拒绝和目录锁互斥。正式2000局需在Windows自行启动。
