# Group Debate Agent Hub · 议事厅

> **多 Agent 实时辩论指挥台。**
> 将多个独立人设的 AI Agent 组织成一个智囊团，先做发散式 Brainstorm，再进入结构化辩论，可选地用类搜索证据补强发言，支持人类随时介入，并输出结构化结论报告。

> 默认语言：英文，详见 [README.md](./README.md)。

![status](https://img.shields.io/badge/status-v0.1-5FE0C7) ![stack](https://img.shields.io/badge/stack-React%2018%20%2B%20Vite%206%20%2B%20TS-E8B14C) ![mode](https://img.shields.io/badge/runtime-provider%20ready-9A8CFF)

## 项目简介

Group Debate Agent Hub 是一个本地前端原型，用于编排一组拥有独立人设与辩论角色的 AI Agent。当前实现基于真实的 LLM 请求流程：

- `src/components/gateway/GatewayPanel.tsx` 用于配置 Provider 模板并测试连接
- `src/engine/LLMConfig.ts` 从 UI 状态或环境变量解析 Provider 配置
- `src/engine/LLMClient.ts` 通过 `/llm-proxy` 发送聊天请求，支持 OpenAI 兼容端点、Anthropic 以及 Ark Coding Plan
- `src/engine/DebateEngine.ts` 使用已配置的 Provider 运行实际的 Brainstorm 与 Debate 阶段，Agent 各自的聊天历史持久化到 `localStorage`
- `src/engine/SearchResolver.ts` 在提供 API Key 时通过 Tavily / Serper 路由搜索工具调用，而 Anthropic/Ark 可使用原生搜索

它还包含人设辅助模块与示例人设模板（位于 `src/engine/MockLLM.ts`），但当 Provider 配置完成时，辩论流水线本身依赖真实的 LLM 集成。

## 辩论团队运转机制

议事厅不是一个全知全能的单一模型，而是一个**独立 Agent 组成的议事团**——每个 Agent 自带人设、立场与私有记忆，由 `src/engine/DebateEngine.ts` 编排。一次运行历经四个阶段：`idle → brainstorm → debate → report`。

### 1. Agent 是独立的思考者

每个 Agent 都是拥有独立状态的一等公民：

- **人设**（`MockLLM.ts` 的 `resolvePersona`）：名称、一句话简介、详细描述、关注点、语气，以及一个**立场**——`pro` / `con` / `neutral`。neutral 角色扮演事实审稿人 / 裁判，而非站队。
- **私有聊天历史**：每个 Agent 拥有独立的 `ChatMessage[]`（存于按 `sessionId → agentId` 索引的内存 `sessionMemory` 中）。系统提示词按 Agent 由「人设 + 立场 + 议题 + 议事规则」单独构造，**绝不跨 Agent 共享**——一个 Agent 只能看到其他人的最终发言，看不到他们的思考过程或系统提示词。
- **持久化记忆**：每个回合结束后，Agent 的历史通过 `sessionStore` 持久化到 `localStorage`，因此页面刷新或后续会话仍能带着完整上下文恢复。

### 2. 「先想后说」协议

每个 Agent 的响应被强制走双段输出契约：

```text
<thinking>  至少 200 字真实推理：拆解命题、找反例、权衡证据、定发言策略 </thinking>
<answer>    250 字以内的正式发言 </answer>
```

`parseAnswer` 将两者分离，`sanitizeThinking` 在思考内容进入事件流前剔除泄漏的工具调用 / artifact 标签。`<thinking>` 通道同时通过 `reasoning_content` / 扩展思考实时流式输出，让你实时观看每个 Agent 的推理。

系统提示词强制六条议事纪律：(1) 先深度思考；(2) **交叉引用**前文某一具体观点（`回应 @[名字] 关于「…」的观点`）；(3) 引用证据；(4) **诚实性**——证据不如人时承认调整立场，而非诡辩；(5) 推进而非复读自己上轮论点；(6) 保持人设。

### 3. 分阶段流程

**Brainstorm**（`startBrainstorm`）：串行发散式一轮。每个 Agent 独立从自身人设视角提出 1–2 个角度，并明确要求**不要重复前面 Agent 的视角**。第 0 轮发言为辩论播下种子。

**Debate**（`enterDebate`）：多轮对抗循环（2–5 轮可配）。每轮中，每个 Agent 收到一条 `user` 消息，其中包含**上一轮所有其他 Agent 的发言**外加辩论指令。Agent 必须回应至少一个对方观点，可调用 `web_search`，且不得复读自己先前的论点。记忆跨轮累积，阶段进入时从 store 重新加载。

**Report**（`ReportBuilder.build`）：对发言记录做两种压缩：
- **模板版**按关键词主题聚类（机会与价值 / 风险与边界 / 用户与体验 / 数据与证据 / 战略与时机 / 伦理与治理），逐主题统计支持 / 反对者，并据此推导共识（支持率 ≥55% 且零反对）与分歧，外加具体行动建议。
- **LLM 版**（配置了 Provider 时）把完整记录连同严格 JSON schema 喂给模型，覆盖模板版的 TL;DR / 总结 / 共识 / 分歧 / 评述 / 行动建议，产出更贴合内容的报告。任何错误时回退到模板版。

### 4. 证据与搜索

搜索是**可选且立场感知**的，绝不凭空编造。三条路径，由 `speak()` 依据 Provider 类型分发：

- **Anthropic / Ark**：原生联网在 `chat()` *内部*完成，模型自主搜索并返回 `sources`。若未返回来源，引擎会再提示一次并重试。
- **OpenAI 兼容**（OpenAI / DeepSeek / Moonshot / Ollama / Custom）：暴露 `web_search` 函数工具；`chatWithTools` 跑一个**多轮工具循环**（最多 4 次），由 LLM 自行决定搜几次。结果经 `SearchResolver`（Tavily / Serper）路由，并以 `tool` 消息回灌。
- 主调用前有一次预检索，由「议题 + 背景 + 对方上一条观点」拼出查询，提前捞出立场相关的证据。

所有来源以 `cite` 事件进入事件流，并挂到对应发言上，最终报告因此能按论点列出证据。

### 5. 人类介入与控制

- **打断**：`pushHumanInterrupt` 把主持人指令压入按会话隔离的缓冲区；下一个 Agent 的 `user` 消息会带上最新一条，从而在运行中实时纠偏。
- **生命周期**：`pause` / `resume` 通过轮询 `waitIfPaused` 闸住循环；`stop` 把阶段切到 `idle` 并重置 Agent 状态。每个循环边界都检查 `isStopped()`，使停止在 Agent / 轮次之间生效，而不会在调用中途中断。
- **校验，不静默降级**：运行前 `validateLLMConfig` 在 Provider 缺少 API Key / Base URL / Model 时以明确错误硬失败——引擎绝不静默回退到 mock 生成。

### 6. 会话隔离

所有记忆、打断缓冲、事件与发言都按 `activeSessionId` 隔离。切换会话即切换活动的记忆 map 与打断缓冲，多个议题可并存而互不污染。

## 核心功能

- 可配置 Agent 人设：名称、立场、语气、关注点、论风
- 2–8 名 Agent 会话，支持从预置人设自动补全
- Brainstorm 与 Debate 阶段，实时事件流与发言流
- 多轮辩论支持（2–5 轮）
- 基于 `src/engine/LLMClient.ts` 的 Provider 驱动 LLM 执行
- 通过 Anthropic/Ark 原生搜索或 Tavily/Serper 函数工具支持搜索
- 运行中随时插入人类指令
- 暂停 / 继续 / 终止 / 重新开始
- Provider 模板：OpenAI / Anthropic / DeepSeek / Moonshot / Ollama / Custom
- 生成结构化报告：共识、分歧、关键观点、行动建议
- 使用 `localStorage` 本地持久化

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
│   ├── gateway/      # 模型 Provider 配置
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

- 核心辩论流程实现在 `src/engine/DebateEngine.ts`，通过 `src/engine/LLMClient.ts` 使用已配置的 Provider。
- `src/engine/MockLLM.ts` 提供人设解析与本地 mock 生成工具，但在存在有效 LLM 配置时运行路径由 Provider 驱动。
- 当活动 Provider 缺少值时，`src/engine/LLMConfig.ts` 也会回退到 `VITE_LLM_API_KEY`、`VITE_LLM_BASE_URL` 和 `VITE_LLM_MODEL`。
- 搜索通过 Anthropic/Ark 原生搜索支持，或在配置了 Tavily/Serper Key 时通过 `src/engine/SearchResolver.ts` 的函数工具路径支持。

## 推荐使用流程

1. 打开议题编辑器并设置辩论问题。
2. 在 Roster 面板配置 Agent 人设。
3. 选择辩论模式和 Provider 模板。
4. 启动 Brainstorm 或直接进入 Debate。
5. 观察事件流并在必要时发送纠偏指令。
6. 查看生成的报告并按需导出。

## 路线图

- 真实 LLM Provider 接入（OpenAI、Anthropic、DeepSeek）
- 外部 API 搜索 / 证据检索
- 多议题会话管理
- 报告 PDF 导出
- WebSocket 协作和实时共享
- 音频 / 文本回放

## 许可

MIT
