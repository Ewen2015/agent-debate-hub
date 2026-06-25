# 团队工程规范

> 一个可移植、可泛化的多 Agent 团队任务框架。
> 当前唯一的具体任务是**辩论（Debate）**；本文档将团队、成员、工作机制、Loop、技能（Skill）等抽象出来，使新的任务类型（推演、圆桌讨论、协作开发……）可以在不重写调度层的前提下接入。

---

## 1. 愿景

Group Debate Agent Hub 当前只运行一种任务类型：**辩论**。引擎、记忆、事件流和报告都与 brainstorm → debate → report 的生命周期紧耦合。

本规范的目标是将**团队是什么**与**团队做什么**分离开来：

- **团队（Team）** 是一个可复用的成员花名册，包含人设、角色和私有记忆。
- **任务（Task）** 是一个有类型的工作单元（辩论、推演、圆桌讨论、协作开发……），团队通过一个**Loop**（阶段循环）来执行它。
- **技能（Skill）** 是成员在任务执行期间可调用的能力（推理、搜索、引用、交叉引用）。
- 所有内容均可**序列化为 Markdown**，使团队和任务可以共享、版本化，并在不同会话间重新导入。

```
┌───────────────────────────────────────────────────┐
│                      Session                        │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │    Team      │  │    Task     │  │  Report   │  │
│  │ (成员、       │  │ (类型、      │  │ (结构化    │  │
│  │  角色、       │  │  配置、      │  │  产出)     │  │
│  │  记忆)        │  │  Loop)      │  │           │  │
│  └──────┬───────┘  └──────┬──────┘  └───────────┘  │
│         │                 │                         │
│         └────────┬────────┘                         │
│                  ▼                                  │
│           ┌────────────┐                             │
│           │   Engine    │  ← 调度阶段                 │
│           │ (Loop 控制) │     分发技能                │
│           └──────┬──────┘     管理记忆                │
│                  ▼                                  │
│           ┌────────────┐                             │
│           │ EventStream │  ← 可观测时间线             │
│           └────────────┘                             │
└───────────────────────────────────────────────────┘
```

---

## 2. 核心抽象

### 2.1 团队（Team）

**团队**是可复用的花名册，独立于任何具体任务。

| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | `string` | 团队唯一标识 |
| `name` | `string` | 人类可读的团队名称 |
| `members` | `Member[]` | 2–8 名成员 |
| `sharedContext` | `string` | 团队级背景知识，注入到每个成员的 system prompt |
| `createdAt` | `number` | 创建时间戳 |

**当前映射**：`useRosterStore.agents` → `Team.members`；隐式的"roster"概念 → `Team`。

### 2.2 成员（Member）

**成员**是独立的推理者，拥有自己的人设、角色和私有记忆。成员是**一等公民**——彼此之间不共享 system prompt、推理过程或聊天历史。

| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | `string` | 成员唯一标识 |
| `name` | `string` | 显示名称 |
| `emoji` | `string` | 头像符号 |
| `gradient` | `[string, string]` | 头像渐变色 |
| `oneLiner` | `string` | 一句话立场摘要 |
| `description` | `string` | 完整人设描述 |
| `focus` | `string[]` | 关注领域标签（如风险、可行性、伦理） |
| `tone` | `string` | 沟通风格 |
| `role` | `MemberRole` | 团队中的功能角色（见下文） |
| `stance` | `Stance` | 对任务议题的初始立场 |
| `status` | `MemberStatus` | 运行时状态 |
| `skills` | `SkillId[]` | 该成员可调用的技能 |
| `memory` | `ChatMessage[]` | 私有对话历史（持久化） |

#### 成员角色（MemberRole）

角色是**功能性的**——描述成员*如何贡献*，而非*论证什么*。

| 角色 | 描述 | 当前映射 |
|------|------|----------|
| `advocate`（倡导者） | 为某一立场辩护 | `stance: pro` 的人设 |
| `challenger`（挑战者） | 反驳；寻找风险和反例 | `stance: con` 的人设 |
| `arbiter`（裁决者） | 核查事实、调解、评估证据质量 | `stance: neutral` 的人设 |
| `synthesizer`（综合者） | 提炼主题和收敛度（系统或某成员） | 当前 `summarizeRound` / `ReportBuilder` 系统调用 |
| `moderator`（主持人） | 控制流程、注入指令 | 人类用户 |

#### 立场（Stance）

```ts
type Stance = 'pro' | 'con' | 'neutral';
```

立场是**任务特定的**：同一成员在不同任务中的立场可能不同。在"是否发布 X"的辩论中，某成员可能是 `pro`；在"攻方 vs 守方"的推演中，同一成员可能是 `attacker`。因此 stance 字段属于**任务配置**，而非硬编码在成员中。

#### 成员状态（MemberStatus）

```ts
type MemberStatus = 'idle' | 'thinking' | 'searching' | 'speaking' | 'paused';
```

### 2.3 任务（Task）

**任务**是团队执行的有类型工作单元。辩论是一种具体的任务类型；框架设计支持多种。

| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | `string` | 任务实例唯一标识 |
| `type` | `TaskType` | 任务类别（见下文） |
| `topic` | `string` | 议题或问题陈述 |
| `background` | `string` | 可选的补充背景 |
| `config` | `TaskConfig` | 类型特定配置（轮次、计时器、角色……） |
| `phase` | `Phase` | 当前执行阶段 |
| `loop` | `LoopStep[]` | 任务经历的有序阶段 |
| `currentStep` | `number` | `loop` 中的索引 |
| `startedAt` | `number` | 开始时间戳 |
| `totalElapsedMs` | `number` | 总挂钟时长 |

#### 任务类型（TaskType）

```ts
type TaskType = 'debate' | 'wargame' | 'roundtable' | 'collab';
```

| 类型 | 描述 | 状态 |
|------|------|------|
| `debate`（辩论） | 对抗性多轮论证，pro/con/neutral 立场 | **已实现** |
| `wargame`（推演） | 红队/蓝队场景模拟；结构化的攻防回合 | 规划中 |
| `roundtable`（圆桌讨论） | 非对抗性多视角讨论；无固定立场 | 规划中 |
| `collab`（协作开发） | 合作式开发任务；成员产出代码/设计产物 | 规划中 |

每种任务类型注册一个**运行器（Runner）**——实现 `TaskRunner` 接口的类（见 §5）。

### 2.4 阶段（Phase）

```ts
type Phase = 'idle' | 'brainstorm' | 'debate' | 'report';
```

在抽象层中，阶段被**泛化**：

| 具体名称（辩论） | 抽象名称 | 语义 |
|------------------|----------|------|
| `idle` | `idle` | 未开始/已结束 |
| `brainstorm` | `diverge`（发散） | 发散式想法生成 |
| `debate` | `converge`（收敛） | 对抗性收敛/迭代 |
| `report` | `synthesize`（综合） | 结构化输出生成 |

### 2.5 技能（Skill）

**技能**是成员在任务回合中可调用的能力。技能是可插拔的，按成员声明（某成员可能有 `search` 但没有 `code-exec` 等）。

| 技能 ID | 描述 | 当前实现 |
|---------|------|----------|
| `reason` | 先思考后发言：输出 `<thinking>` 再输出 `<answer>` | `DebateEngine.ts` 中的 `buildSystemPrompt` + `parseAnswer` |
| `search` | 联网搜索证据；通过 Tavily / Serper 或原生搜索分发 | `SearchResolver.ts` + `chatWithTools` |
| `cite` | 将来源作为证据附加到发言 | `Speech` 类型上的 `Source[]` |
| `cross-reference` | 引用并回应另一成员的具体论点 | system prompt 规则 #2 |
| `memory` | 跨轮次持久化并重载私有对话历史 | `sessionMemory` map + `persistAgentMemory` |
| `summarize` | 将一轮的观点提炼为简洁摘要 | `DebateEngine.ts` 中的 `summarizeRound` |

#### 技能接口

```ts
interface Skill {
  id: SkillId;
  name: string;
  description: string;
  /** 调用技能。返回结构化结果供引擎消费。 */
  execute(ctx: SkillContext): Promise<SkillResult>;
}

interface SkillContext {
  memberId: string;
  taskId: string;
  history: ChatMessage[];
  config: LLMConfig;
  signal: AbortSignal;
  /** 向时间线推送可观测事件 */
  emit: (event: TaskEvent) => void;
}

interface SkillResult {
  reasoning?: string;       // 思考过程
  content: string;          // 正式输出
  sources?: Source[];       // 引用的证据
  artifacts?: Artifact[];   // 协作任务的产物（代码、设计……）
}
```

### 2.6 事件（Event）

**事件流**是可观测的时间线。所有成员动作、系统状态转换和人类介入都流经此处。

```ts
interface TaskEvent {
  id: string;
  ts: number;
  memberId: string;        // 'human' | 'system' | 成员 ID
  type: EventType;
  payload: {
    text?: string;
    sources?: Source[];
    step?: number;          // 当前 Loop 步骤/轮次
    subText?: string;
  };
}

type EventType =
  | 'think'          // 成员推理中
  | 'speak'          // 成员产出输出
  | 'search'         // 成员发起搜索
  | 'cite'           // 来源已附加
  | 'interrupt'      // 人类主持人指令
  | 'round-summary'  // 系统生成的步骤摘要
  | 'system';        // 阶段转换、错误、信息
```

### 2.7 记忆（Memory）

每个成员拥有一份**私有**的 `ChatMessage[]` 历史。记忆的特性：

- **隔离**：成员之间看不到彼此的 system prompt 或思考过程。
- **持久化**：每轮结束后保存到 `localStorage`；会话恢复时重新加载。
- **会话级**：以 `sessionId → memberId` 为键，多个议题共存且互不污染。
- **跨轮次**：在会话内的 Loop 步骤间累积；第 5 轮的成员可以引用第 1 轮的论点。

### 2.8 报告（Report）

**报告**是任务结束时产出的结构化输出。它感知任务类型：

| 字段 | 辩论报告 | 泛化含义 |
|------|----------|----------|
| `tldr` | 走向 + 收敛趋势 | 任务如何推进的摘要 |
| `summary` | 内容概述 | 团队产出了什么 |
| `consensus` | 共识点 | 收敛的结论 |
| `disagreements` | 分歧点 | 未解决的张力 |
| `actions` | 下一步建议 | 可执行的产出 |
| `arguments` | 按主题聚类的正反方明细 | 任务特定的结构化分析 |
| `roundSummaries` | 每轮观点演进 | 每步的进展 |

---

## 3. 工作机制

### 3.1 阶段状态机

所有任务都经过一组有序的阶段。辩论的阶段状态机是参考实现：

```
idle → diverge → converge → synthesize → idle
```

转换规则：

| 事件 | 从 → 到 |
|------|---------|
| `START` | `idle` → `diverge` |
| `ENTER_CONVERGE` | `diverge` → `converge` |
| `GENERATE_REPORT` | `converge` → `synthesize` |
| `RESET` | 任意 → `idle` |
| `PAUSE` / `RESUME` | 切换 `paused` 标志，不改变阶段 |

每种任务类型通过 `LoopStep[]` 定义自己的阶段序列（见 §4）。

### 3.2 事件流

事件流是任务期间发生了什么的**唯一事实来源**。它具有以下特性：

- **只追加**（修剪到最近 500 条以限制内存）。
- **可观测**：UI 订阅以渲染实时时间线。
- **双向**：人类介入注入事件，后续成员读取这些事件。

### 3.3 人在环中（Human-in-the-Loop）

人类用户作为**主持人**，可以：

1. **介入**：将指令推入按会话隔离的介入缓冲区。下一个成员的 `user` 消息会取走最新条目，在执行过程中引导团队。
2. **暂停/恢复**：通过轮询门控 Loop；在成员回合之间生效，不会在调用中途生效。
3. **停止**：将阶段翻转为 `idle` 并重置所有成员状态。每个 Loop 边界都检查 `isStopped()`。
4. **继续**：向已结束的任务追加额外步骤，复用已积累的记忆且不重置。

### 3.4 会话隔离

所有记忆、介入缓冲区、事件和发言都按 `activeSessionId` 隔离。切换会话会交换活跃的记忆 map 和介入缓冲区。多个议题可以共存且互不污染。

### 3.5 校验，不静默降级

任何运行前，`validateLLMConfig` 在 Provider 缺少 API Key / Base URL / Model 时硬失败并给出明确错误。引擎从不静默回退到 mock 生成。这一原则适用于所有任务类型：**大声失败，早失败**。

---

## 4. Loop（执行循环）

### 4.1 泛化 Loop

每个任务执行一个 **Loop**——一个有序的步骤列表。每个步骤包含：

| 字段 | 类型 | 描述 |
|------|------|------|
| `name` | `string` | 步骤名称（如"Brainstorm"、"第 1 轮"） |
| `phase` | `Phase` | 该步骤所属阶段 |
| `mode` | `'parallel' \| 'sequential'` | 成员在此步骤中如何行动 |
| `directive` | `string` | 注入到每个成员 `user` 消息中的指令 |
| `skills` | `SkillId[]` | 此步骤中可用的技能 |
| `onComplete` | `'auto' \| 'manual'` | 自动推进还是等待用户 |

### 4.2 辩论 Loop（参考实现）

当前辩论任务使用此 Loop：

```
步骤 0: Brainstorm（阶段: diverge）
  mode: parallel（并发）
  directive: "基于你的人设提出 1-2 个发散视角。
              不要重复前面成员的视角。"
  skills: [reason, search, cite]
  onComplete: auto（自动）

步骤 1..N: 辩论第 r 轮（阶段: converge）
  mode: sequential（串行）
  directive: "第 r 轮。以下是上一轮其他成员的发言。
              你必须回应至少一个对方论点。不要复读你之前的论点。
              [可选的人类主持人指令]"
  skills: [reason, search, cite, cross-reference]
  onComplete: auto（自动，每轮生成摘要）

步骤 N+1: 报告（阶段: synthesize）
  mode: system-only（仅系统）
  directive: "从记录中生成结构化报告。"
  skills: [summarize]
  onComplete: manual（手动）
```

### 4.3 Loop 控制

```
                    ┌──────────────────────────┐
                    │       用户输入             │
                    │  (议题、配置、开始)         │
                    └────────────┬──────────────┘
                                 ▼
                    ┌──────────────────────────┐
              ┌────▶│   Engine.dispatch(step)   │◀────┐
              │     └────────────┬──────────────┘     │
              │                  ▼                    │
              │     ┌──────────────────────────┐     │
              │     │  遍历步骤中的每个成员：     │     │
              │     │  1. 构建 system prompt    │     │
              │     │  2. 构建 user 消息        │     │
              │     │     (上一轮发言 +          │     │
              │     │      指令 + 介入)          │     │
              │     │  3. 设置状态: thinking    │     │
              │     │  4. 调用技能              │     │
              │     │  5. 解析输出              │     │
              │     │  6. 推送事件 + 发言       │     │
              │     │  7. 持久化记忆            │     │
              │     │  8. 设置状态: idle        │     │
              │     └────────────┬──────────────┘     │
              │                  ▼                    │
              │     ┌──────────────────────────┐     │
              │     │  步骤完成？                │     │
              │     │  - 是: 摘要步骤           │     │
              │     │  - 推送 round-summary    │     │
              │     │  - 推进到下一步           │─────┘
              │     └────────────┬──────────────┘
              │                  ▼
              │     ┌──────────────────────────┐
              │     │  介入 / 暂停？            │
              │     │  - 介入: 注入到下一      │
              │     │    个成员的 user 消息    │
              │     │  - 暂停: 轮询直到恢复    │
              └─────┤  - 停止: 重置为 idle    │
                    └──────────────────────────┘
```

### 4.4 收敛度追踪

每个步骤产出一个 **StepSummary**，包含收敛度得分。辩论实现使用四分量复合指标：

| 分量 | 权重 | 衡量内容 |
|------|------|----------|
| 立场趋同 | 0.10 | 成员是否收敛到同一立场？ |
| 观点重合 | 0.20 | 成员是否使用相近的词汇/论点？ |
| 认同倾向 | 0.50 | 显式认同 vs 反对信号比 |
| 步骤间稳定 | 0.20 | 讨论是否跨步骤稳定？ |

这是任务类型特定的：推演可能追踪"威胁覆盖率"而非"认同倾向"。每种任务类型提供自己的收敛函数。

---

## 5. 任务运行器接口

每种任务类型注册一个**运行器（Runner）**，实现以下接口：

```ts
interface TaskRunner {
  /** 该运行器处理的任务类型 */
  readonly type: TaskType;

  /** 启动前校验配置。无效则抛出错误。 */
  validate(config: TaskConfig, team: Team): void;

  /** 为此任务类型构建 Loop 步骤。 */
  buildLoop(config: TaskConfig): LoopStep[];

  /** 为某步骤中的某成员构建 system prompt。 */
  buildSystemPrompt(member: Member, step: LoopStep, task: Task): string;

  /** 为某成员在某步骤中的回合构建 user 消息。 */
  buildUserMessage(
    member: Member,
    step: LoopStep,
    task: Task,
    context: TurnContext,
  ): string;

  /** 摘要一个已完成的步骤（摘要 + 观点 + 收敛度）。 */
  summarizeStep(
    step: LoopStep,
    speeches: Speech[],
    team: Team,
    config: LLMConfig,
  ): Promise<StepSummary>;

  /** 从所有发言 + 步骤摘要构建最终报告。 */
  buildReport(
    task: Task,
    speeches: Speech[],
    stepSummaries: StepSummary[],
    config: LLMConfig,
  ): Promise<Report>;
}
```

### 5.1 DebateRunner（参考实现）

| 方法 | 当前实现 |
|------|----------|
| `validate` | `DebateEngine.ts` 中的 `validateLLMConfig()` |
| `buildLoop` | 硬编码：brainstorm → N 轮辩论 → 报告 |
| `buildSystemPrompt` | `buildSystemPrompt()` — 人设 + 立场 + 辩论规则 |
| `buildUserMessage` | 内联在 `startBrainstorm` / `enterDebate` / `continueDebate` |
| `summarizeStep` | `summarizeRound()` — 每成员观点提炼 + 摘要 |
| `buildReport` | `ReportBuilder.build()` — 模板 + LLM 双通道 |

### 5.2 规划中的运行器

#### WargameRunner（推演运行器）

- **立场**：`attacker`（攻方）/ `defender`（守方）/ `observer`（观察者）（替代 pro/con/neutral）
- **Loop**：`setup → red-team-strike → blue-team-defend → assess → iterate → report`
- **技能**：`reason`、`search`、`scenario-model`（场景建模）、`impact-assess`（影响评估）
- **收敛度**："威胁覆盖率"而非认同倾向
- **报告**：威胁矩阵、防御缺口、残余风险

#### RoundtableRunner（圆桌运行器）

- **立场**：全部 `neutral`（无对抗立场）
- **Loop**：`open → contribute → react → synthesize → report`
- **技能**：`reason`、`search`、`cite`、`build-on`（在他人的想法上延伸）
- **收敛度**："想法密度"和"主题覆盖度"
- **报告**：主题图谱、贡献指数、综合结论

#### CollabRunner（协作运行器）

- **立场**：全部 `collaborator`
- **Loop**：`plan → implement → review → integrate → report`
- **技能**：`reason`、`search`、`code-exec`（代码执行）、`review`（审查）、`test`（测试）
- **收敛度**："任务完成度"和"审查通过率"
- **报告**：产物索引、审查日志、测试结果

---

## 6. 技能目录

### 6.1 推理（`reason`）

先思考后发言协议。强制两部分输出：

```
<thinking>  ≥200 字真实推理：拆解论点、寻找反例、权衡证据、决定策略 </thinking>
<answer>    ≤600 字正式输出 </answer>
```

- `parseAnswer` 拆分两个通道。
- `sanitizeThinking` 剥离泄漏的工具调用/artifact 标签。
- `<thinking>` 通道通过 `reasoning_content` / extended-thinking 实时流式输出。

**泛化**：思考阈值和答案长度可按任务类型配置。协作任务可能允许 1000 字答案；圆桌讨论可能放宽思考要求。

### 6.2 搜索（`search`）

联网搜索证据。三条分发路径：

| Provider 类型 | 机制 | 当前实现 |
|---------------|------|----------|
| Anthropic / Ark | 原生服务端搜索；模型自主搜索 | `LLMClient.ts` 中的 `chat()` |
| OpenAI 兼容 | `web_search` 函数工具；多轮工具循环（≤4 次） | `DebateEngine.ts` 中的 `chatWithTools` |
| 预搜索 | 在主调用前构造立场感知的查询 | `speak()` 中内联 |

结果通过 `SearchResolver`（Tavily / Serper）路由，并以 `tool` 消息回传。

**泛化**：搜索是一种技能，任何任务类型可按成员启用/禁用。推演可能仅允许 `observer` 成员搜索。

### 6.3 引用（`cite`）

将来源作为证据附加到发言。来源以 `cite` 事件流入事件流，并附加到产生它的发言上。

```ts
interface Source {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}
```

### 6.4 交叉引用（`cross-reference`）

system prompt 规则，要求成员显式回应前一成员的具体论点：

```
回应 @[名字] 关于「...」的观点
```

**泛化**：交叉引用格式是任务特定的。圆桌讨论可能用"在@[名字]的想法基础上延伸"；协作开发可能用"审查@[名字]的 PR"。

### 6.5 记忆（`memory`）

持久化并重载私有对话历史：

- **保存**：每轮结束后，`persistAgentMemory` 写入 `sessionStore`（localStorage）。
- **加载**：会话恢复/继续时，`loadMemoryFromStore` 恢复所有成员的历史。
- **重置**：`resetMemory` 清空活跃会话的内存 map 和存储。

### 6.6 摘要（`summarize`）

将一步的观点提炼为简洁摘要。使用**分级保底**机制：

1. 严格改写（无 ≥5 字原文连续片段、Jaccard < 0.6）
2. 严格重试（强调禁止照搬）
3. 宽松接受（无 ≥10 字原文连续片段）
4. 算法去重（删除与原文重合的片段）
5. 提取式压缩（去套话、取首句）

**保证**：总有摘要返回——永不返回"未能提炼"。

---

## 7. 可移植 Markdown 格式

团队和任务可序列化为 Markdown，用于共享、版本化和重新导入。

### 7.1 团队 Markdown

```markdown
---
teamId: roster-001
teamName: 战略议事团
createdAt: 2026-06-25T10:00:00Z
sharedContext: |
  该团队从多角度评估产品决策。
  所有成员必须引用证据，被驳倒时需诚实让步。
---

# 成员

## 理想主义者

- **role**: advocate
- **stance**: pro
- **oneLiner**: 长期主义 · 价值驱动
- **focus**: [长期价值, 愿景一致性, 道德伦理, 社会影响]
- **tone**: 激昂 · 诗意 · 富有感染力
- **skills**: [reason, search, cite, cross-reference, memory]
- **description**: |
  相信长期价值与社会正向意义。在评估任何方案时优先考虑愿景、
  使命、可持续性。容易被宏大叙事吸引，但容易忽视短期成本。

## 怀疑论者

- **role**: challenger
- **stance**: con
- **oneLiner**: 逆向思维 · 证据优先
- **focus**: [风险评估, 认知偏差, 反例举证, 证伪]
- **tone**: 冷静 · 尖锐 · 反问驱动
- **skills**: [reason, search, cite, cross-reference, memory]
- **description**: |
  对所有"听起来太好的方案"保持本能的怀疑。总是问
  "那如果失败呢？""证据是什么？""有没有反例？"。

<!-- ... 更多成员 ... -->
```

### 7.2 任务 Markdown

```markdown
---
taskId: debate-2026-06-25-001
taskType: debate
teamId: roster-001
topic: 我们是否应该将单体架构拆分为微服务？
background: |
  当前系统：2 年的 Rails 单体，5 万行代码，8 名工程师。
  增长：12 个月内预计流量增长 3 倍。
config:
  maxRounds: 5
  enableSearch: true
  thinkingMinChars: 200
  answerMaxChars: 600
startedAt: 2026-06-25T10:00:00Z
totalElapsedMs: 183000
---

# Loop

## 步骤 0: Brainstorm（diverge）
- mode: parallel
- skills: [reason, search, cite]
- onComplete: auto

## 步骤 1-5: 辩论轮次（converge）
- mode: sequential
- skills: [reason, search, cite, cross-reference]
- onComplete: auto

## 步骤 6: 报告（synthesize）
- mode: system-only
- skills: [summarize]
- onComplete: manual

# 结果

## TL;DR
[走向 + 收敛趋势]

## 共识点
1. ...

## 分歧点
1. ...

## 行动建议
1. ...
```

### 7.3 导入 / 导出

| 方向 | 格式 | 方法 |
|------|------|------|
| 导出团队 | Markdown | 将 `Team` 序列化为 frontmatter + 成员段落 |
| 导入团队 | Markdown | 解析 frontmatter + 成员段落 → `Team` 对象 → `useRosterStore` |
| 导出任务 | Markdown | 将 `Task` + `Speech[]` + `StepSummary[]` 序列化为完整记录 |
| 导入任务 | Markdown | 解析 → 恢复会话状态、记忆、发言 |

---

## 8. 数据模型（TypeScript）

```ts
// ── 团队 ──
interface Team {
  id: string;
  name: string;
  members: Member[];
  sharedContext: string;
  createdAt: number;
}

// ── 成员 ──
interface Member {
  id: string;
  name: string;
  emoji: string;
  gradient: [string, string];
  oneLiner: string;
  description: string;
  focus: string[];
  tone: string;
  role: MemberRole;
  stance: Stance;
  status: MemberStatus;
  skills: SkillId[];
}

type MemberRole = 'advocate' | 'challenger' | 'arbiter' | 'synthesizer' | 'moderator';
type Stance = 'pro' | 'con' | 'neutral';
type MemberStatus = 'idle' | 'thinking' | 'searching' | 'speaking' | 'paused';
type SkillId = 'reason' | 'search' | 'cite' | 'cross-reference' | 'memory' | 'summarize';

// ── 任务 ──
interface Task {
  id: string;
  type: TaskType;
  topic: string;
  background?: string;
  config: TaskConfig;
  phase: Phase;
  loop: LoopStep[];
  currentStep: number;
  startedAt: number;
  totalElapsedMs?: number;
  paused: boolean;
}

type TaskType = 'debate' | 'wargame' | 'roundtable' | 'collab';
type Phase = 'idle' | 'diverge' | 'converge' | 'synthesize';

interface TaskConfig {
  maxRounds: number;
  enableSearch: boolean;
  thinkingMinChars: number;
  answerMaxChars: number;
  // 任务类型特定的扩展
  [key: string]: any;
}

interface LoopStep {
  name: string;
  phase: Phase;
  mode: 'parallel' | 'sequential';
  directive: string;
  skills: SkillId[];
  onComplete: 'auto' | 'manual';
}

// ── 发言 ──
interface Speech {
  id: string;
  step: number;
  memberId: string;
  stance: Stance;
  text: string;
  sources?: Source[];
  ts: number;
}

// ── 步骤摘要 ──
interface StepSummary {
  step: number;
  title: string;
  digest: string;
  viewpoints: {
    memberId: string;
    name: string;
    stance: Stance;
    viewpoint: string;
    viewpointFull?: string;
    evidenceCount: number;
  }[];
  convergence: number;
  elapsedMs?: number;
}

// ── 报告 ──
interface Report {
  taskId: string;
  generatedAt: number;
  tldr: string;
  tldrMeta?: {
    model?: string;
    memberCount: number;
    stepCount: number;
    duration: string;
    convergence?: { from: number; to: number; trend: string };
  };
  summary: string;
  evaluation: string[];
  consensus: string[];
  disagreements: string[];
  actions: string[];
  arguments: {
    id: string;
    point: string;
    supporters: string[];
    opposers: string[];
    evidence: Source[];
  }[];
  stepSummaries?: StepSummary[];
}
```

---

## 9. 扩展指南

### 9.1 添加新任务类型

1. **定义 Loop**：选择阶段（如推演：`setup → strike → defend → assess → synthesize`）。
2. **实现 `TaskRunner`**：创建 `WargameRunner` 实现 §5 中的接口。
3. **注册运行器**：添加到运行器注册表，使引擎可按 `TaskType` 分发。
4. **定义立场**：如果任务使用非 pro/con 立场（如 `attacker`/`defender`），扩展 `Stance` 类型或在内部映射到 pro/con/neutral。
5. **定义收敛度**：实现任务特定的收敛函数（如推演的威胁覆盖率）。
6. **定义报告 schema**：如有需要，用任务特定字段扩展 `Report`。
7. **添加 Markdown 序列化**：确保任务可导出/导入。

### 9.2 添加新技能

1. **实现 `Skill` 接口**（见 §2.5）。
2. **注册技能**到技能目录。
3. **在成员配置中引用**：将技能 ID 添加到 `Member.skills[]`。
4. **在 Loop 步骤中引用**：将技能 ID 添加到 `LoopStep.skills[]` 以按步骤启用。

### 9.3 添加新成员角色

1. 用新角色扩展 `MemberRole`。
2. 定义角色如何与 Loop 交互（如 `reviewer` 角色只在审查步骤中行动）。
3. 更新 system prompt 构建器以纳入角色特定指令。

---

## 10. 当前实现映射

本表将当前辩论实现映射到本规范中的抽象：

| 抽象 | 当前代码 | 泛化位置 |
|------|----------|----------|
| 团队 | `useRosterStore.agents` | `Team` 对象 |
| 成员 | `Persona` + `RosterAgent` | `Member`（合并） |
| 成员角色 | 隐式（从 `stance` 推导） | 显式 `MemberRole` 字段 |
| 任务 | `Session`（仅辩论） | `Task`（有类型） |
| 任务类型 | 硬编码 `'debate'` | `TaskType` 联合类型 |
| 任务运行器 | `DebateEngine`（一体式） | `TaskRunner` 接口 + `DebateRunner` |
| Loop | 硬编码在 `DebateEngine` 中 | `Task` 上的 `LoopStep[]` |
| 阶段 | `types/index.ts` 中的 `Phase` | 相同，泛化名称 |
| 技能: reason | `buildSystemPrompt` + `parseAnswer` | `ReasonSkill` |
| 技能: search | `SearchResolver` + `chatWithTools` | `SearchSkill` |
| 技能: cite | `Speech` 上的 `Source[]` | `CiteSkill` |
| 技能: cross-reference | system prompt 规则 #2 | `CrossReferenceSkill` |
| 技能: memory | `sessionMemory` + `persistAgentMemory` | `MemorySkill` |
| 技能: summarize | `summarizeRound` | `SummarizeSkill` |
| 事件 | `DebateEvent` | `TaskEvent`（重命名） |
| 步骤摘要 | `RoundSummary` | `StepSummary`（重命名） |
| 报告 | `FinalReport` | `Report`（重命名） |
| 收敛度 | `convergence.ts` 中的 `computeConvergence` | 任务特定收敛函数 |
| Markdown 导出 | `ReportBuilder.toMarkdown` | 扩展为团队 + 任务序列化 |

---

## 11. 路线图

1. **重构 `DebateEngine` → `DebateRunner`**：将辩论特定逻辑提取为实现 `TaskRunner` 的类，留下一个按任务类型分发的通用 `Engine`。
2. **合并 `Persona` + `RosterAgent` → `Member`**：将两个类型统一为单个成员定义，带显式 `role` 和 `skills`。
3. **为 `Task` 添加 `LoopStep[]`**：使 Loop 声明式而非硬编码在引擎中。
4. **实现团队/任务 Markdown 序列化**：通过 frontmatter + 结构化段落导出/导入。
5. **实现 `WargameRunner`**：第一个非辩论任务类型，用于验证抽象。
6. **技能插件系统**：动态注册技能；允许按任务类型自定义技能。
