# Group Debate Agent Hub · 议事厅

> **Real-time multi-agent debate command center.**
> Organize multiple AI agents with distinct personas into a brainstorming and debate flow, optionally enrich their arguments with search-like evidence, allow human intervention at any time, and produce a structured consensus report.

> Default language: English. 中文版在下面。

![status](https://img.shields.io/badge/status-v0.1-5FE0C7) ![stack](https://img.shields.io/badge/stack-React%2018%20%2B%20Vite%206%20%2B%20TS-E8B14C) ![mode](https://img.shields.io/badge/runtime-provider%20ready-9A8CFF)

## What is this?

Group Debate Agent Hub is a local frontend prototype for coordinating a panel of AI agents with independent personas and debate roles. The current implementation is built around a real LLM request flow:

- `src/components/gateway/GatewayPanel.tsx` lets you configure provider templates and test connections
- `src/engine/LLMConfig.ts` resolves provider config from UI state or environment variables
- `src/engine/LLMClient.ts` sends chat requests through `/llm-proxy` and supports OpenAI-compatible endpoints, Anthropic, and Ark Coding Plan
- `src/engine/DebateEngine.ts` runs the actual Brainstorm and Debate stages using configured providers, with agent-specific chat history persisted to `localStorage`
- `src/engine/SearchResolver.ts` routes search-tool calls through Tavily / Serper if API keys are provided, while Anthropic/Ark can use native search

It also includes persona helper modules and sample persona templates in `src/engine/MockLLM.ts`, but the debate pipeline itself relies on the real LLM integration when a provider is configured.

## Key Features

- Configurable agent personas: name, stance, tone, focus, and argument style
- 2–8 agents per session, with auto-fill from persona presets
- Brainstorm and debate phases with live event and speech timelines
- Multi-round debate support (2–5 rounds)
- Provider-backed LLM execution via `src/engine/LLMClient.ts`
- Search support through Anthropic/Ark native search or Tavily/Serper function tool
- Human intervention commands during live sessions
- Pause / resume / stop / restart controls
- Provider templates for OpenAI / Anthropic / DeepSeek / Moonshot / Ollama / Custom
- Structured report generation with consensus, disagreement, key arguments, and recommended actions
- Local persistence via `localStorage`

## Quick Start

Install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm dev
```

Open the app in your browser:

```text
http://localhost:5173
```

Build for production:

```bash
pnpm build
pnpm preview
```

## Project Structure

```
src/
├── components/
│   ├── arena/        # Debate arena UI: AgentRing, EventStream, SpeechStream, StageControl
│   ├── gateway/      # Model provider configuration
│   ├── question/     # Topic editor and prompt controls
│   ├── report/       # Summary report panel
│   ├── roster/       # Agent persona roster
│   └── shared/       # Reusable UI components
├── data/             # Persona presets and mock evidence data
├── engine/           # Debate engine, mock LLM, proxy config, report builder
├── hooks/            # Custom hooks
├── store/            # Zustand state and persistence stores
├── styles/           # Global CSS and theme styles
├── types/            # TypeScript types
└── main.tsx          # Application entry point
```

## Runtime Notes

- The core debate flow is implemented in `src/engine/DebateEngine.ts` and uses configured providers via `src/engine/LLMClient.ts`.
- `src/engine/MockLLM.ts` provides persona resolution and local mock generation utilities, but the runtime path is provider-driven when a valid LLM config exists.
- `src/engine/LLMConfig.ts` can also fall back to `VITE_LLM_API_KEY`, `VITE_LLM_BASE_URL`, and `VITE_LLM_MODEL` if the active provider is missing values.
- Search is supported through Anthropic/Ark native search and through the function-tool path in `src/engine/SearchResolver.ts` when Tavily or Serper keys are configured.

## Recommended Workflow

1. Open the topic editor and set the debate question.
2. Configure agent personas in the roster panel.
3. Choose the debate mode and provider template.
4. Start brainstorming or jump directly into debate.
5. Monitor the event stream and send corrections when needed.
6. Review the generated report and export if desired.

## Roadmap

- Real LLM provider integration (OpenAI, Anthropic, DeepSeek)
- Search / evidence retrieval from external APIs
- Multi-topic session management
- PDF report export
- WebSocket-based collaboration and real-time sharing
- Audio or transcript playback

## License

MIT

---

# Group Debate Agent Hub · 议事厅

> **多 Agent 实时辩论指挥台。**
> 将多个独立人设的 AI Agent 组织成一个智囊团，先做发散式 Brainstorm，再进入结构化辩论，支持人类随时介入，并输出统一结论报告。

> 默认语言：英文。中文内容在下面。

## 项目简介

Group Debate Agent Hub 是一个本地前端原型，展示如何编排多角色 AI 参与 brainstorm 和 debate 流程。它支持：

- 议题发散思考
- 多轮正反辩论
- 拟真检索式证据补强
- 运行中人类纠偏指令
- 自动生成结构化结论报告

当前实现基于 `src/engine/DebateEngine.ts` 的 Provider 驱动辩论流程，真实执行路径依赖于你在 Gateway 中配置的模型提供者。`src/engine/MockLLM.ts` 仅用于人设解析和辅助生成逻辑，并非默认的运行核心。

## 核心功能

- 可配置 Agent 人设：名称、立场、语气、关注点、论风
- 2–8 名 Agent 会话，支持预置自动补全
- Brainstorm 与 Debate 阶段，实时事件与发言流
- 支持 2–5 轮辩论
- 拟真搜索资料补强发言
- 运行中随时插入人类指令
- 暂停 / 继续 / 终止 / 重新开始
- Provider 模板：OpenAI / Anthropic / DeepSeek / Moonshot / Ollama / Custom
- 生成结构化报告：共识、分歧、关键观点、行动建议
- 使用 `localStorage` 保持会话状态

## 快速开始

安装依赖：

```bash
pnpm install
```

启动开发服务器：

```bash
pnpm dev
```

在浏览器打开：

```text
http://localhost:5173
```

构建生产版本：

```bash
pnpm build
pnpm preview
```

## 目录说明

```
src/
├── components/
│   ├── arena/        # 议场 UI：AgentRing、EventStream、SpeechStream、StageControl
│   ├── gateway/      # 模型接入配置
│   ├── question/     # 议题编辑与提示设置
│   ├── report/       # 报告面板
│   ├── roster/       # Agent 人设列表
│   └── shared/       # 可复用组件
├── data/             # 人设预设与模拟资料数据
├── engine/           # 辩论引擎、Mock LLM、代理配置、报告生成器
├── hooks/            # 自定义 Hook
├── store/            # Zustand 状态与持久化
├── styles/           # 全局样式与主题
├── types/            # TypeScript 类型
└── main.tsx          # 应用入口
```

## 运行说明

- 当前真实运行路径由 `src/engine/DebateEngine.ts` 控制，依赖 `src/engine/LLMConfig.ts` 所解析的 Provider 配置。
- `src/engine/MockLLM.ts` 只负责人物设定、文本装饰与生成辅助逻辑，不决定是否使用真实模型。
- 真实搜索功能可通过 Anthropic/Ark 的原生联网或 `src/engine/SearchResolver.ts` 中的 Tavily/Serper Key 启用。
- 如果 Provider 未配置完整，系统会在 Gateway 中提示填写 API Key、Base URL 和 Model。

## 推荐使用流程

1. 打开议题编辑器并设置问题。
2. 在 Roster 面板配置 Agent 人设。
3. 选择辩论模式和 Provider 模板。
4. 启动 Brainstorm 或直接进入 Debate。
5. 观察事件流并在必要时插入纠偏指令。
6. 查看生成报告并导出。

## 路线图

- 真实模型接入（OpenAI、Anthropic、DeepSeek）
- 外部搜索 / 证据检索
- 多议题会话管理
- 报告 PDF 导出
- WebSocket 协作和实时共享
- 音频/文本回放

## 许可

MIT
