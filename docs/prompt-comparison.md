# Prompt 版本对照记录

> 生成时间：2026-07-14T14:15:25.859Z
> 运行模式：真实模型

## 量化结果

| 模型 | 任务 | Prompt 版本 | 用例数 | 平均首 Token/ms | 平均总延迟/ms | 输入 Token | 输出 Token | 总估算成本 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| claude-fable-5-dd-5.4-korg | summary | summary.v1 | 3 | 7066 | 7637 | 513 | 962 | 未配置 |
| claude-fable-5-dd-5.4-korg | summary | summary.v2 | 3 | 7865 | 9406 | 1443 | 1712 | 未配置 |
| claude-fable-5-dd-5.4-korg | summary | summary.v3 | 3 | 12432 | 13513 | 1158 | 1819 | 未配置 |
| claude-fable-5-dd-5.4-korg | task-extraction | task-extraction.v1 | 3 | 4201 | 4869 | 822 | 1135 | 未配置 |
| claude-fable-5-dd-5.4-korg | task-extraction | task-extraction.v2 | 3 | 3604 | 3843 | 899 | 1073 | 未配置 |
| claude-fable-5-dd-5.4-korg | task-extraction | task-extraction.v3 | 3 | 16412 | 16862 | 993 | 913 | 未配置 |
| claude-fable-5-dd-5.4-korg | risk-detection | risk-detection.v1 | 3 | 33513 | 43461 | 2798 | 4671 | 未配置 |
| claude-fable-5-dd-5.4-korg | risk-detection | risk-detection.v2 | 3 | 8246 | 9531 | 886 | 2166 | 未配置 |
| claude-fable-5-dd-5.4-korg | risk-detection | risk-detection.v3 | 3 | 12015 | 12377 | 2204 | 2314 | 未配置 |

## 人工质量复核

从 `evals/results/prompt-latest.jsonl` 中按任务抽查同一输入在 v1、v2、v3 下的回答，按 1～5 分记录：

| 任务 | 推荐版本 | 格式稳定性 | 是否少编造 | 是否易复用 | 备注 |
|---|---|---:|---:|---:|---|
| summary | 待评 | 待评 | 待评 | 待评 |  |
| task-extraction | 待评 | 待评 | 待评 | 待评 |  |
| risk-detection | 待评 | 待评 | 待评 | 待评 |  |

## 今日结论

1. 最适合作为默认版本：
2. 最大改进来自：明确任务 / 输入边界 / 输出格式 / 示例。
3. 下一次实验唯一要改变的变量：
