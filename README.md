# Group Debate Agent Hub · 议事厅

> **Real-time multi-agent debate command center.**
> Organize multiple AI agents with distinct personas into a brainstorming and debate flow, optionally enrich their arguments with search-like evidence, allow human intervention at any time, and produce a structured consensus report.

> Default language: English. 中文版见 [README_CN.md](./README_CN.md)。

![status](https://img.shields.io/badge/status-v0.1-5FE0C7) ![stack](https://img.shields.io/badge/stack-React%2018%20%2B%20Vite%206%20%2B%20TS-E8B14C) ![mode](https://img.shields.io/badge/runtime-provider%20ready-9A8CFF)

## What is this?

Group Debate Agent Hub is a local frontend prototype for coordinating a panel of AI agents with independent personas and debate roles. The current implementation is built around a real LLM request flow:

- `src/components/gateway/GatewayPanel.tsx` lets you configure provider templates and test connections
- `src/engine/LLMConfig.ts` resolves provider config from UI state or environment variables
- `src/engine/LLMClient.ts` sends chat requests through `/llm-proxy` and supports OpenAI-compatible endpoints, Anthropic, and Ark Coding Plan
- `src/engine/DebateEngine.ts` runs the actual Brainstorm and Debate stages using configured providers, with agent-specific chat history persisted to `localStorage`
- `src/engine/SearchResolver.ts` routes search-tool calls through Tavily / Serper if API keys are provided, while Anthropic/Ark can use native search

It also includes persona helper modules and sample persona templates in `src/engine/MockLLM.ts`, but the debate pipeline itself relies on the real LLM integration when a provider is configured.

## How the Debate Team Works

The hub is not a single omniscient model — it is a **panel of independent agents**, each carrying its own persona, stance, and private memory, orchestrated by `src/engine/DebateEngine.ts`. A run moves through four phases: `idle → brainstorm → debate → report`.

### 1. Agents as independent reasoners

Each agent is a first-class citizen with its own state:

- **Persona** (`resolvePersona` in `MockLLM.ts`): name, one-liner, description, focus areas, tone, and a **stance** — `pro` / `con` / `neutral`. The neutral agent acts as a fact-checker / arbiter rather than taking a side.
- **Private chat history**: every agent owns a separate `ChatMessage[]` (held in an in-memory `sessionMemory` map, keyed by `sessionId → agentId`). The system prompt is built per-agent from persona + stance + topic + debate rules, and is **never shared** between agents — an agent only ever sees the *others' final answers*, never their reasoning traces or system prompts.
- **Persistent memory**: after each turn the agent's history is persisted to `localStorage` via `sessionStore`, so a page refresh or a later session can resume with full context intact.

### 2. The "think before you speak" protocol

Every agent response is forced through a two-part output contract:

```text
<thinking>  ≥200 chars of genuine reasoning: deconstruct the claim,
            surface counterexamples, weigh evidence, decide strategy </thinking>
<answer>    ≤250 chars formal speech </answer>
```

`parseAnswer` splits the two and `sanitizeThinking` strips any leaked tool-call/artifact tags before the thinking is shown in the event stream. The `<thinking>` channel is also streamed live via `reasoning_content` / extended-thinking, so you watch each agent reason in real time.

The system prompt enforces five debate disciplines: (1) think first, (2) **cross-reference** a specific prior argument (`回应 @[name] 关于「…」的观点`), (3) cite evidence, (4) **intellectual honesty** — concede when out-evidenced instead of sophistry, (5) advance rather than repeat, and (6) stay in character.

### 3. Phased flow

**Brainstorm** (`startBrainstorm`): sequential divergent pass. Each agent independently proposes 1–2 angles from its persona's lens, with an explicit instruction *not* to repeat prior agents' perspectives. Round 0 speeches seed the debate.

**Debate** (`enterDebate`): multi-round adversarial loop (1–100 rounds, configurable). Each round, every agent receives a `user` message containing **the previous round's speeches from all other agents** plus the debate directive. Agents must respond to at least one opposing argument, may call `web_search`, and cannot parrot their own prior points. Memory accumulates across rounds and is reloaded from store on phase entry.

**Continue Debate** (`continueDebate`): after a debate ends, append extra rounds that **continue the existing round numbering** (e.g. rounds 1–3 → append → rounds 4, 5…), reusing accumulated agent memory without resetting. The append picker offers 10 / 20 quick buttons plus a 1–100 manual input.

**Report** (`ReportBuilder.build`): the transcript is condensed two ways:
- A **template pass** clusters speeches by keyword themes (机会与价值 / 风险与边界 / 用户与体验 / 数据与证据 / 战略与时机 / 伦理与治理), tallies pro/con supporters per theme, and derives consensus (≥55% support, 0 opposition) vs. disagreement plus concrete action items.
- An **LLM pass** (when a provider is configured) feeds the full transcript to the model with a strict-JSON schema, overriding the template's TL;DR / summary / consensus / disagreements / evaluation / actions for a tighter, content-grounded report. It falls back to the template on any error.

Each round also produces a **RoundSummary** (digest + one distilled viewpoint per agent + convergence score), which powers the **Argument Evolution Graph** (per-round columns of shifting viewpoints) and the **Convergence Curve** (a convergence-over-rounds line chart). Per-round and total elapsed time are tracked and surfaced in the summary and event stream. Reports can be exported as a standalone **HTML file** with inline CSS and SVG.

### 4. Evidence & search

Search is **opt-in and stance-aware**, never fabricated. Three paths, dispatched by `speak()` based on provider kind:

- **Anthropic / Ark**: native web search runs *inside* `chat()`; the model searches on its own and returns `sources`. If it returns none, the engine re-prompts once and retries.
- **OpenAI-compatible** (OpenAI / DeepSeek / Moonshot / Ollama / Custom): a `web_search` function tool is exposed; `chatWithTools` runs a **multi-turn tool loop** (up to 4 iterations) so the LLM decides how many times to search. Results are routed through `SearchResolver` (Tavily / Serper) and fed back as `tool` messages.
- A pre-search pass crafts a query from topic + background + the opponent's last point to surface stance-relevant evidence before the main call.

All sources flow into the event stream as `cite` events and attach to the originating speech, so the final report can list evidence per argument.

### 5. Human-in-the-loop & control

- **Interruption**: `pushHumanInterrupt` enqueues a moderator directive into a per-session buffer; the next agent's `user` message picks up the latest entry, steering the panel mid-flight.
- **Lifecycle**: `pause` / `resume` gate the loop via a polling `waitIfPaused`; `stop` flips phase to `idle` and resets agent statuses. Every loop boundary checks `isStopped()` so a stop takes effect between agents/rounds, never mid-call.
- **Validation, no silent degradation**: `validateLLMConfig` hard-fails with a precise error before any run if the provider is missing API key / base URL / model — the engine never silently falls back to mock generation.

### 6. Session isolation

All memory, interrupt buffers, events, and speeches are scoped to `activeSessionId`. Switching sessions swaps the active memory map and interrupt buffer, so multiple topics can coexist without cross-contamination.

## Key Features

- Configurable agent personas: name, stance, tone, focus, and argument style
- 2–8 agents per session, with auto-fill from persona presets
- Brainstorm and debate phases with live event and speech timelines
- Multi-round debate support (1–100 rounds), with post-debate **continue debate** that extends the round numbering
- Per-round and total elapsed-time tracking
- Provider-backed LLM execution via `src/engine/LLMClient.ts`
- Search support through Anthropic/Ark native search or Tavily/Serper function tool
- Human intervention commands during live sessions
- Pause / resume / stop / restart controls
- Provider templates for OpenAI / Anthropic / DeepSeek / Moonshot / Ollama / Custom
- Structured report generation with consensus, disagreement, key arguments, recommended actions, argument evolution graph, and convergence curve
- HTML report export with inline CSS and SVG
- Runtime logging system with a UI log viewer
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
│   ├── dev/          # Dev-only panels: LogPanel (runtime log viewer)
│   ├── gateway/      # Model provider configuration
│   ├── question/     # Topic editor and prompt controls
│   ├── report/       # Summary report panel, evolution graph, convergence curve
│   ├── roster/       # Agent persona roster
│   └── shared/       # Reusable UI components
├── data/             # Persona presets and mock evidence data
├── engine/           # DebateEngine, LLMClient/LLMConfig, SearchResolver, ReportBuilder,
│                     # convergence scoring, logger, text utils, proxy URL
├── store/            # Zustand state and persistence stores
├── styles/           # Global CSS and theme styles
├── types/            # TypeScript types
└── main.tsx          # Application entry point
```

E2E / probe scripts live under `scripts/` (`e2e-*.cjs`, `probe-*.cjs`, `test-ark-*.mjs`).

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

- Portable teams **and** tasks via Markdown — generalize beyond debate so that both the team (roster: personas, stances, focus) and what the team is tasked to do are serializable into a portable `.md` file (working name `team-engineering.md`), shareable / versionable / re-importable across sessions. Tasks are not limited to debate; planned types include wargame (推演), roundtable (圆桌讨论), and collab (合作开发)
- Pluggable task runners — each task type gets its own runner (e.g. `DebateRunner`, `WargameRunner`, `RoundtableRunner`, `CollabRunner`) sharing a common team, memory, and event layer, so new task types can be added without touching existing ones
- WebSocket-based collaboration and real-time sharing
- Audio or transcript playback

## License

MIT
