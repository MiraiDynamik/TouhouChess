# MadChess 低难度对照

用于 normal / hard 初筛。easy 由用户与 Chess.com 低难度机器人手动对照。MadChess 的 UCI_Elo 不等同于 Chess.com 10 分钟快棋等级分。

## 本机试跑

2026-10-27 从官方 https://github.com/ekmadsen/MadChess 编译，提交 `18a4320b07537c4c03dd6f6b8ec5ba0794152444`。UCI 自报 `MadChess 3.5 x64`，范围 600–2600；名称中的 x64 是编译常量产生的标签，实际使用 Apple Silicon .NET 10 ARM64 运行时及 AnyCPU 程序集。

临时 SDK：`/private/tmp/touhou-dotnet`；源码：`/private/tmp/touhou-madchess`；编译输出：`/private/tmp/touhou-madchess-build`。这些是临时工具，不是游戏依赖。系统清理临时目录后需重新准备。

```sh
conda run --no-capture-output -n TouhouChess python lab/stockfish_match.py \
  --engine-command /private/tmp/touhou-dotnet/dotnet /private/tmp/touhou-madchess-build/MadChess.Engine.dll \
  --elos 650 --pairs 1 --level normal --native-time --time-ms 3000 \
  --out lab/out/madchess-normal-650-pilot

conda run --no-capture-output -n TouhouChess python lab/stockfish_match.py \
  --engine-command /private/tmp/touhou-dotnet/dotnet /private/tmp/touhou-madchess-build/MadChess.Engine.dll \
  --elos 1100 --pairs 1 --level hard --native-time --time-ms 3000 \
  --out lab/out/madchess-hard-1100-pilot
```

每组一对换色，共四局，标准初始局面。Eirin 使用游戏原生预算及深度上限，对手每手 3 秒、64 MB Hash；每个输出目录独立写入。每步保存 JSON，另生成 `report.md` 和 `games.csv`。达到 300 ply 上限记未决，不计和棋。Ctrl+C 后相同命令续跑；源码或配置改变需新目录。保留 `stockfish_match.py` 文件名和旧字段以兼容既有实验。

所有走法与终局继续由共享 TS 引擎验证；没有复制规则。`--engine-command` 支持 DLL 启动，记录运行命令、启动程序和程序集目录文件哈希；仅向对手发送它实际支持的 UCI 选项。

这轮只验证接入并观察量级，不能用两局得分率反推出 Elo。后续若扩大实验，应使用多样化、成对换色的开局，并结合用户真人体验决定难度参数。

## 初筛结果

四局均已将杀结束，未出现非法走法或未决局：

| 本方 | 对手档位 | 本方执白 | 本方执黑 | 总结果 |
|---|---:|---|---|---|
| normal | 650 | 负，144 ply | 负，163 ply | 0 胜 2 负 |
| hard | 1100 | 胜，101 ply | 胜，88 ply | 2 胜 0 负 |

normal 可能偏弱，hard 在本轮能够战胜 1100 档；不能由每档两局认定真实平台等级分。没有修改任何引擎配置。四份 JSON 已通过共享规则重放并验证终局，另导出各局 PGN 与 `games.pgn`，再解析验证步数。hard 完成后用同命令重启，验证能够跳过已完成对局并正常退出。

## 追加对局（2026-10-27，已启动，结果待汇总）

用户要求保留 easy、normal、hard 的参数不变，扩大 MadChess 样本。已核验共享引擎、CLI、研究脚本与依赖锁文件的联合指纹和初筛一致。

normal 对650、hard 对1100各追加4对8局，`--pairs 4 --start-pair 2`；预算及300 ply上限沿用初筛。完成后连同初筛每档共10局。两组各自顺序运行，使用不同目录，避免竞争写入结果文件：

- `lab/out/madchess-normal-650-additional/`
- `lab/out/madchess-hard-1100-additional/`

每个目录的 `launch.json` 保存进程ID和完整续跑命令，`run.log` 保存运行日志，`report.md` / `games.csv` 由现有程序定期更新。追加批次从第2对开始，避免复用初筛第1对的本方随机种子。仍为标准初始局面，增加局数不能消除同一起始局面的局限。

### 追加批次与新配置的边界

追加批次运行期间，用户授权将游戏内normal选着概率改为2/8/40/50（原为5/15/40/40）。当前常驻Node桥接进程仍使用启动时加载的旧代码，因此本页已有及正在进行的试跑全部属于旧normal配置。不要将其结果标为新版表现，也不要在新源码下强行绕过manifest校验续跑旧目录。

## normal 新配置10局（2026-10-27，已启动）

用户要求停止旧normal、改跑新版10局。执行停止操作时旧normal追加批次已经结束并释放锁，无需发送信号；旧版累计10局为1胜0和9负，记录原样保留。hard进程不动。

新版目录：`lab/out/madchess-normal-650-v2-10games/`，5对换色，pair 1–5；normal概率2/8/40/50，原生950ms预算/4层上限，对手MadChess650每手3000ms，300ply上限。完整命令与进程ID在`launch.json`，日志在`run.log`，报告由程序更新。新旧源码指纹分开记录，不混合得分率。
