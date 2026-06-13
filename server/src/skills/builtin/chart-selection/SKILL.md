---
name: chart-selection
description: 为回答或报告选择合适展示方式：简单逻辑和结构用 Mermaid，复杂报表、交互分析或精确图表用 HTML artifact。Use when the task needs visual presentation choices, Mermaid diagrams, or richer report artifacts.
allowed-tools: file_read grep write_html_artifact
metadata:
  my-agent.tool-scope: markdown
---

# Chart Selection

## Workflow

1. 先判断这是“回答中的简单展示”还是“复杂报表”。
2. 简单逻辑、流程、关系、时序、状态和架构说明优先用 Mermaid。
3. 精确数值图表、交互筛选、多图组合、复杂 dashboard 或需要样式控制的报告，使用 HTML artifact。
4. 如果文字或列表更清楚，不要强行画图。
5. 如果需要 Mermaid 具体图型对照，读取 `references/presentation-guide.md`。

## Quick Decision

- 解释执行流程、状态机、模块关系：Mermaid。
- 展示时间线、排期、实体关系：Mermaid。
- 展示 1-2 个很轻的结构图：Mermaid。
- 展示真实数值趋势、柱状图、散点图、复杂表格、多个联动视图：HTML artifact。
- 用户要求“报表”“仪表盘”“可视化页面”“交互”：HTML artifact。

## Output Rules

- Mermaid 用 Markdown fenced code block。
- HTML artifact 用 `write_html_artifact`，最终回答说明生成路径。
- 图前说明图要表达的结论，不写空泛标题。
- 图后补充口径限制，例如“只展示主路径，异常路径已省略”。
