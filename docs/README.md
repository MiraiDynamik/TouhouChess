# 开发文档

本目录集中存放架构决策、开发记录及 AI 开发所需的交接资料。使用游戏请看 [项目首页](../README.md)。

| 文档 | 内容 |
|---|---|
| [开发日志](DEVELOPMENT_LOG.md) | 从原 README 整理的架构与开发背景，以及后续变更记录 |
| [前端开发说明](FRONTEND.md) | Svelte 组件、界面修改入口、Worker、构建与测试 |
| [Windows 等时对局](TIMED_H2H.md) | 三秒永琳剪枝对照实验、续跑、Markdown/CSV 报告 |
| [Stockfish 对局](STOCKFISH_MATCH.md) | 开发者开启剪枝对阵 1320/1500 限强档位 |
| [研究记录](RESEARCH.md) | 实验结论、证据、已作废结论和待研究事项 |
| [实验计划](EXPERIMENT_PLAN.md) | 交接时的实验路线、判据和历史运行记录 |

项目强制约束保留在根目录 [AGENTS.md](../AGENTS.md)，便于开发工具自动发现。规则资料继续放在 [rules/](../rules/)，不与开发日志混放。

文档中的命令均在项目根目录执行。Python 项目脚本必须使用 Miniconda 的 `TouhouChess` 环境。实验计划中的历史耗时、进度及测试数量不是当前运行状态；开始实验前应核对现有代码和结果文件。
