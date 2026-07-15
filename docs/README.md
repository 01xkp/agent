# 文档导航

文档按“先运行，再理解，再深入”组织。相同内容只保留一个主要入口，其他文档通过链接引用。

## 第一次接触项目

1. [根 README](../README.md)：安装、启动和最常用命令；
2. [项目全景与架构](architecture.md)：项目目的、模块作用和完整数据流；
3. [配置参数说明](configuration.md)：每个环境变量会改变什么；
4. [Agent 小白白话指南](agent-beginner-guide.md)：从生活类比开始理解 Agent；
5. [故障排查](troubleshooting.md)：聊天慢、接口错误和部署问题。

## 理解 AI 工程

- [Agent 小白白话指南](agent-beginner-guide.md)：先用生活类比理解 Agent、Workflow、Tool、RAG、Memory、MCP、HITL、Trace 和 Eval；
- [Agent 工作流与高 Star 项目对照](agent-workflow.md)；
- [Week 1 小白验收指南](week1-beginner-guide.md)；
- [Week 2–Week 9 小白实战指南](week2-9-beginner-guide.md)；
- [9 周学习路线](learning-roadmap.md)；
- [Day 1 概念笔记](day-1-notes.md)；
- [Python、FastAPI 与 LangGraph](python-fastapi-guide.md)；
- [企业智能支持 Agent](enterprise-support-agent.md)。

## 使用具体功能

- [创图工具箱](toolbox-guide.md)；
- [CloudBase 数据与保存](cloudbase-guide.md)。

## 评测结果

- [模型比较](model-comparison.md)；
- [Prompt 比较](prompt-comparison.md)；
- [Structured Output 报告](structured-output-report.md)。

评测报告由固定脚本生成，适合看结果；架构和操作说明不要复制到报告中。

## 发布和展示

- [腾讯云部署](deployment.md)。

## 推荐阅读顺序

```text
README
  → architecture.md
  → configuration.md
  → npm run dev
  → npm run check
  → agent-beginner-guide.md
  → agent-workflow.md
  → 按需要阅读具体模块
```
