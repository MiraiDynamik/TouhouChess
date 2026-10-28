# 开发文档

本目录集中存放架构决策、开发记录及 AI 开发所需的交接资料。使用游戏请看 [项目首页](../README.md)。

| 文档 | 内容 |
|---|---|
| [开发日志](DEVELOPMENT_LOG.md) | 从原 README 整理的架构与开发背景，以及后续变更记录 |
| [前端开发说明](FRONTEND.md) | Svelte 组件、界面修改入口、Worker、构建与测试 |
| [置换表](TRANSPOSITION_TABLE.md) | 缓存实现、东方棋适配、生命周期与性能验证 |
| [第二阶段搜索实验](SEARCH_PHASE2.md) | 历史消融结果；PVS/futility已删除，目前仅保留LMR |
| [Windows 等时对局](TIMED_H2H.md) | 三秒永琳剪枝对照实验、续跑、Markdown/CSV 报告 |
| [棋子价值标定](PIECE_VALUE.md) | Windows 分阶段实验：先妖精对兵，再用兵与妖精标定恋 |
| [妖精固定交换实验](FAIRY_EXCHANGE.md) | 当前入口：先验1.5，两妖精对三兵/一马，各500对，共2000局 |
| [PGN 棋谱格式](PGN.md) | 标准 SAN/FEN 互通、仙灵扩展 v1、导入分析和实验导出 |
| [Stockfish 对局](STOCKFISH_MATCH.md) | 开发者开启剪枝对阵 1320/1500 限强档位 |
| [MadChess 低难度对照](MADCHESS_TESTING.md) | normal / hard 对照 650 / 1100 档，原生预算、换色试跑与续跑 |
| [Eirin 速度工程报告](EIRIN_PERFORMANCE_ENGINEERING.md) | 同机与同语言基准、源码差距、原型反证和实施路线 |
| [TT 交互实验](TT_INTERACTIONS.md) | 容量、深结果复用、静态搜索缓存与TT走法优先的组合效应；1M槽追加实验 |
| [紧凑表示实验](COMPACT_REPRESENTATIONS.md) | 1M/深复用已启用；数字棋盘与压缩走法的六组合等价及性能测试 |
| [数字内核上线与状态/键实验](STATE_KEY_EXPERIMENTS.md) | 数字棋盘与压缩走法已上线；复用状态帧和增量键的对照、负结果与验证 |
| [研究记录](RESEARCH.md) | 实验结论、证据、已作废结论和待研究事项 |
| [实验计划](EXPERIMENT_PLAN.md) | 交接时的实验路线、判据和历史运行记录 |

项目强制约束保留在根目录 [AGENTS.md](../AGENTS.md)，便于开发工具自动发现。规则资料继续放在 [rules/](../rules/)，不与开发日志混放。

文档中的命令均在项目根目录执行。Python 项目脚本必须使用 Miniconda 的 `TouhouChess` 环境。实验计划中的历史耗时、进度及测试数量不是当前运行状态；开始实验前应核对现有代码和结果文件。
