# Team Engineering Specification

> A portable, generalizable framework for multi-agent team tasks.
> Today the only concrete task is **Debate**; this document abstracts the team, members, working mechanism, loop, and skills so that new task types (wargame, roundtable, collab, …) can be added without rewriting the orchestration layer.

---

## 1. Vision

Group Debate Agent Hub currently runs one task type: **debate**. The engine, memory, event stream, and reporting are tightly coupled to the brainstorm → debate → report lifecycle.

The goal of this specification is to separate **what a team is** from **what a team does**:

- A **Team** is a reusable roster of members with personas, roles, and private memory.
- A **Task** is a typed unit of work (debate, wargame, roundtable, collab, …) that a team executes through a **Loop** of phases.
- **Skills** are capabilities (reasoning, search, citation, cross-reference) that members invoke during a task.
- Everything is **serializable to Markdown** so teams and tasks can be shared, versioned, and re-imported across sessions.

```
┌───────────────────────────────────────────────────┐
│                      Session                       │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │    Team      │  │    Task     │  │  Report   │ │
│  │ (members,    │  │ (type,      │  │ (structured│ │
│  │  roles,      │  │  config,   │  │  output)  │ │
│  │  memory)     │  │  loop)     │  │           │ │
│  └──────┬───────┘  └──────┬──────┘  └───────────┘ │
│         │                 │                         │
│         └────────┬────────┘                         │
│                  ▼                                  │
│           ┌────────────┐                             │
│           │   Engine    │  ← orchestrates phases     │
│           │ (loop ctrl) │     dispatches skills      │
│           └──────┬──────┘     manages memory         │
│                  ▼                                  │
│           ┌────────────┐                             │
│           │ EventStream │  ← observable timeline     │
│           └────────────┘                             │
└───────────────────────────────────────────────────┘
```

---

## 2. Core Abstractions

### 2.1 Team

A **Team** is the reusable roster. It is independent of any specific task.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique team identifier |
| `name` | `string` | Human-readable team name |
| `members` | `Member[]` | 2–8 members |
| `sharedContext` | `string` | Team-level background knowledge injected into every member's system prompt |
| `createdAt` | `number` | Creation timestamp |

**Current mapping**: `useRosterStore.agents` → `Team.members`; the implicit "roster" concept → `Team`.

### 2.2 Member

A **Member** is an independent reasoner with its own persona, role, and private memory. Members are **first-class citizens** — they do not share system prompts, reasoning traces, or chat history with each other.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique member identifier |
| `name` | `string` | Display name |
| `emoji` | `string` | Avatar symbol |
| `gradient` | `[string, string]` | Avatar gradient colors |
| `oneLiner` | `string` | One-sentence stance summary |
| `description` | `string` | Full persona description |
| `focus` | `string[]` | Focus-area tags (e.g. risk, feasibility, ethics) |
| `tone` | `string` | Communication style |
| `role` | `MemberRole` | Functional role within the team (see below) |
| `stance` | `Stance` | Initial position on the task topic |
| `status` | `MemberStatus` | Runtime state |
| `skills` | `SkillId[]` | Capabilities this member can invoke |
| `memory` | `ChatMessage[]` | Private conversation history (persisted) |

#### MemberRole

Roles are **functional** — they describe *how* a member contributes, not *what* they argue.

| Role | Description | Current mapping |
|------|-------------|-----------------|
| `advocate` | Argues for a position | Persona with `stance: pro` |
| `challenger` | Argues against; finds risks and counterexamples | Persona with `stance: con` |
| `arbiter` | Fact-checks, mediates, evaluates evidence quality | Persona with `stance: neutral` |
| `synthesizer` | Distills themes and convergence (system or a member) | Currently the `summarizeRound` / `ReportBuilder` system call |
| `moderator` | Controls flow, injects directives | The human user |

#### Stance

```ts
type Stance = 'pro' | 'con' | 'neutral';
```

Stance is **task-specific**: a member's stance may differ between tasks. In a debate about "should we ship X", a member might be `pro`; in a wargame about "attacker vs defender", the same member might be `attacker`. The stance field is therefore part of the **Task config**, not hardcoded into the member.

#### MemberStatus

```ts
type MemberStatus = 'idle' | 'thinking' | 'searching' | 'speaking' | 'paused';
```

### 2.3 Task

A **Task** is a typed unit of work that a team executes. Debate is one concrete task type; the framework is designed to support many.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique task instance identifier |
| `type` | `TaskType` | Task category (see below) |
| `topic` | `string` | The question or problem statement |
| `background` | `string` | Optional supplementary context |
| `config` | `TaskConfig` | Type-specific configuration (rounds, timer, roles, …) |
| `phase` | `Phase` | Current execution phase |
| `loop` | `LoopStep[]` | Ordered phases this task moves through |
| `currentStep` | `number` | Index into `loop` |
| `startedAt` | `number` | Start timestamp |
| `totalElapsedMs` | `number` | Total wall-clock duration |

#### TaskType

```ts
type TaskType = 'debate' | 'wargame' | 'roundtable' | 'collab';
```

| Type | Description | Status |
|------|-------------|--------|
| `debate` | Adversarial multi-round argumentation with pro/con/neutral stances | **Implemented** |
| `wargame` | Red-team / blue-team scenario simulation; structured move-countermove | Planned |
| `roundtable` | Non-adversarial multi-perspective discussion; no fixed stances | Planned |
| `collab` | Cooperative development task; members produce code/design artifacts | Planned |

Each task type registers a **Runner** — a class implementing the `TaskRunner` interface (see §5).

### 2.4 Phase

```ts
type Phase = 'idle' | 'brainstorm' | 'debate' | 'report';
```

Phases are **generalized** in the abstraction:

| Concrete (debate) | Abstract | Semantics |
|-------------------|----------|-----------|
| `idle` | `idle` | Not started / finished |
| `brainstorm` | `diverge` | Divergent idea generation |
| `debate` | `converge` | Adversarial convergence / iteration |
| `report` | `synthesize` | Structured output generation |

### 2.5 Skill

A **Skill** is a capability that a member can invoke during a task turn. Skills are pluggable and declared per-member (a member might have `search` but not `code-exec`, etc.).

| Skill ID | Description | Current implementation |
|----------|-------------|------------------------|
| `reason` | Think-before-speak: emit `<thinking>` then `<answer>` | `buildSystemPrompt` + `parseAnswer` in `DebateEngine.ts` |
| `search` | Web search for evidence; routes through Tavily / Serper or native provider search | `SearchResolver.ts` + `chatWithTools` |
| `cite` | Attach sources to a speech as evidence | `Source[]` on `Speech` type |
| `cross-reference` | Reference and respond to another member's specific argument | System-prompt rule #2 |
| `memory` | Persist and reload private conversation history across rounds | `sessionMemory` map + `persistAgentMemory` |
| `summarize` | Distill a round's viewpoints into a concise digest | `summarizeRound` in `DebateEngine.ts` |

#### Skill interface

```ts
interface Skill {
  id: SkillId;
  name: string;
  description: string;
  /** Invoke the skill. Returns structured result for the engine to consume. */
  execute(ctx: SkillContext): Promise<SkillResult>;
}

interface SkillContext {
  memberId: string;
  taskId: string;
  history: ChatMessage[];
  config: LLMConfig;
  signal: AbortSignal;
  /** Push an observable event to the timeline */
  emit: (event: TaskEvent) => void;
}

interface SkillResult {
  reasoning?: string;       // thinking trace
  content: string;          // formal output
  sources?: Source[];       // cited evidence
  artifacts?: Artifact[];   // for collab tasks (code, design, …)
}
```

### 2.6 Event

The **Event Stream** is the observable timeline. All member actions, system transitions, and human interventions flow through it.

```ts
interface TaskEvent {
  id: string;
  ts: number;
  memberId: string;        // 'human' | 'system' | member id
  type: EventType;
  payload: {
    text?: string;
    sources?: Source[];
    step?: number;          // current loop step / round
    subText?: string;
  };
}

type EventType =
  | 'think'          // member is reasoning
  | 'speak'          // member produced output
  | 'search'         // member invoked search
  | 'cite'           // sources attached
  | 'interrupt'      // human moderator directive
  | 'round-summary'  // system-generated step digest
  | 'system';        // phase transition, error, info
```

### 2.7 Memory

Each member owns a **private** `ChatMessage[]` history. Memory is:

- **Isolated**: members never see each other's system prompts or thinking traces.
- **Persistent**: saved to `localStorage` after every turn; restored on session resume.
- **Session-scoped**: keyed by `sessionId → memberId`, so multiple topics coexist without cross-contamination.
- **Cross-round**: accumulates across loop steps within a session; a member in round 5 can reference arguments from round 1.

### 2.8 Report

The **Report** is the structured output produced at the end of a task. It is task-type aware:

| Field | Debate report | Generalized |
|-------|---------------|-------------|
| `tldr` | Trajectory + convergence trend | Summary of how the task progressed |
| `summary` | Content overview | What the team produced |
| `consensus` | Points of agreement | Converged conclusions |
| `disagreements` | Points of contention | Unresolved tensions |
| `actions` | Next-step recommendations | Actionable outputs |
| `arguments` | Theme-clustered pro/con breakdown | Task-specific structured analysis |
| `roundSummaries` | Per-round viewpoint evolution | Per-step progression |

---

## 3. Working Mechanism

### 3.1 Phase Machine

All tasks move through an ordered set of phases. The debate phase machine is the reference implementation:

```
idle → diverge → converge → synthesize → idle
```

Transitions:

| Event | From → To |
|-------|-----------|
| `START` | `idle` → `diverge` |
| `ENTER_CONVERGE` | `diverge` → `converge` |
| `GENERATE_REPORT` | `converge` → `synthesize` |
| `RESET` | any → `idle` |
| `PAUSE` / `RESUME` | toggle `paused` flag without changing phase |

Each task type defines its own phase sequence via `LoopStep[]` (see §4).

### 3.2 Event Stream

The event stream is the **single source of truth** for what happened during a task. It is:

- **Append-only** (trimmed to last 500 entries to bound memory).
- **Observable**: the UI subscribes to render the live timeline.
- **Bidirectional**: human interrupts inject events that subsequent members read.

### 3.3 Human-in-the-Loop

The human user acts as **moderator** and can:

1. **Interrupt**: push a directive into a per-session interrupt buffer. The next member's `user` message picks up the latest entry, steering the team mid-flight.
2. **Pause / Resume**: gate the loop via polling; takes effect between member turns, never mid-call.
3. **Stop**: flip phase to `idle` and reset all member statuses. Every loop boundary checks `isStopped()`.
4. **Continue**: append extra steps to a finished task, reusing accumulated memory without resetting.

### 3.4 Session Isolation

All memory, interrupt buffers, events, and speeches are scoped to `activeSessionId`. Switching sessions swaps the active memory map and interrupt buffer. Multiple topics can coexist without cross-contamination.

### 3.5 Validation, No Silent Degradation

Before any run, `validateLLMConfig` hard-fails with a precise error if the provider is missing API key / base URL / model. The engine never silently falls back to mock generation. This principle applies to all task types: **fail loud, fail early**.

---

## 4. The Loop

### 4.1 Generalized Loop

Every task executes a **Loop** — an ordered list of steps. Each step has:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Step name (e.g. "Brainstorm", "Round 1") |
| `phase` | `Phase` | Phase this step belongs to |
| `mode` | `'parallel' \| 'sequential'` | How members act in this step |
| `directive` | `string` | Instruction injected into each member's `user` message |
| `skills` | `SkillId[]` | Skills available in this step |
| `onComplete` | `'auto' \| 'manual'` | Auto-advance or wait for user |

### 4.2 Debate Loop (reference implementation)

The current debate task uses this loop:

```
Step 0: Brainstorm (phase: diverge)
  mode: parallel
  directive: "Propose 1-2 divergent angles from your persona's lens.
              Do not repeat prior members' perspectives."
  skills: [reason, search, cite]
  onComplete: auto

Step 1..N: Debate Round r (phase: converge)
  mode: sequential
  directive: "Round r. Here are the previous round's speeches from other members.
              Respond to at least one opposing argument. Do not parrot your own prior points.
              [Optional human moderator directive]"
  skills: [reason, search, cite, cross-reference]
  onComplete: auto (with per-round summary)

Step N+1: Report (phase: synthesize)
  mode: system-only
  directive: "Generate structured report from transcript."
  skills: [summarize]
  onComplete: manual
```

### 4.3 Loop Control

```
                    ┌──────────────────────────┐
                    │       User input          │
                    │  (topic, config, start)   │
                    └────────────┬──────────────┘
                                 ▼
                    ┌──────────────────────────┐
              ┌────▶│   Engine.dispatch(step)    │◀────┐
              │     └────────────┬──────────────┘     │
              │                  ▼                    │
              │     ┌──────────────────────────┐     │
              │     │  For each member in step:  │     │
              │     │  1. Build system prompt    │     │
              │     │  2. Build user message     │     │
              │     │     (prev speeches +       │     │
              │     │      directive + interrupt)│     │
              │     │  3. Set status: thinking   │     │
              │     │  4. Invoke skills          │     │
              │     │  5. Parse output           │     │
              │     │  6. Push event + speech    │     │
              │     │  7. Persist memory        │     │
              │     │  8. Set status: idle       │     │
              │     └────────────┬──────────────┘     │
              │                  ▼                    │
              │     ┌──────────────────────────┐     │
              │     │  Step complete?            │     │
              │     │  - Yes: summarize step    │     │
              │     │  - Push round-summary     │     │
              │     │  - Advance to next step    │─────┘
              │     └────────────┬──────────────┘
              │                  ▼
              │     ┌──────────────────────────┐
              │     │  Interrupt / pause?       │
              │     │  - Interrupt: inject     │
              │     │    into next member's     │
              │     │    user message           │
              │     │  - Pause: poll until      │
              │     │    resumed                │
              └─────┤  - Stop: reset to idle    │
                    └──────────────────────────┘
```

### 4.4 Convergence Tracking

Each step produces a **StepSummary** with a convergence score. The debate implementation uses a four-component composite metric:

| Component | Weight | Measures |
|-----------|--------|----------|
| Stance alignment | 0.10 | Are members converging to the same stance? |
| Lexical cohesion | 0.20 | Are members using similar vocabulary/arguments? |
| Agreement tendency | 0.50 | Explicit agreement vs. disagreement signals |
| Inter-step stability | 0.20 | Is the discussion stable across steps? |

This is task-type specific: a wargame might track "threats neutralized" rather than "agreement tendency". Each task type provides its own convergence function.

---

## 5. Task Runner Interface

Each task type registers a **Runner** that implements:

```ts
interface TaskRunner {
  /** Task type this runner handles */
  readonly type: TaskType;

  /** Validate config before starting. Throw on invalid. */
  validate(config: TaskConfig, team: Team): void;

  /** Build the loop steps for this task type. */
  buildLoop(config: TaskConfig): LoopStep[];

  /** Build the system prompt for a member in a given step. */
  buildSystemPrompt(member: Member, step: LoopStep, task: Task): string;

  /** Build the user message for a member's turn in a given step. */
  buildUserMessage(
    member: Member,
    step: LoopStep,
    task: Task,
    context: TurnContext,
  ): string;

  /** Summarize a completed step (digest + viewpoints + convergence). */
  summarizeStep(
    step: LoopStep,
    speeches: Speech[],
    team: Team,
    config: LLMConfig,
  ): Promise<StepSummary>;

  /** Build the final report from all speeches + step summaries. */
  buildReport(
    task: Task,
    speeches: Speech[],
    stepSummaries: StepSummary[],
    config: LLMConfig,
  ): Promise<Report>;
}
```

### 5.1 DebateRunner (reference)

| Method | Current implementation |
|--------|------------------------|
| `validate` | `validateLLMConfig()` in `DebateEngine.ts` |
| `buildLoop` | Hardcoded: brainstorm → N debate rounds → report |
| `buildSystemPrompt` | `buildSystemPrompt()` — persona + stance + debate rules |
| `buildUserMessage` | Inline in `startBrainstorm` / `enterDebate` / `continueDebate` |
| `summarizeStep` | `summarizeRound()` — per-agent viewpoint distillation + digest |
| `buildReport` | `ReportBuilder.build()` — template pass + LLM pass |

### 5.2 Planned Runners

#### WargameRunner

- **Stances**: `attacker` / `defender` / `observer` (replaces `pro` / `con` / `neutral`)
- **Loop**: `setup → red-team-strike → blue-team-defend → assess → iterate → report`
- **Skills**: `reason`, `search`, `scenario-model`, `impact-assess`
- **Convergence**: "threat coverage ratio" instead of agreement tendency
- **Report**: threat matrix, defense gaps, residual risk

#### RoundtableRunner

- **Stances**: all `neutral` (no adversarial positions)
- **Loop**: `open → contribute → react → synthesize → report`
- **Skills**: `reason`, `search`, `cite`, `build-on` (extend another's idea)
- **Convergence**: "idea density" and "theme coverage"
- **Report**: theme map, contribution index, synthesis

#### CollabRunner

- **Stances**: all `collaborator`
- **Loop**: `plan → implement → review → integrate → report`
- **Skills**: `reason`, `search`, `code-exec`, `review`, `test`
- **Convergence**: "task completion" and "review pass rate"
- **Report**: artifact index, review log, test results

---

## 6. Skill Catalog

### 6.1 Reason (`reason`)

The think-before-speak protocol. Forces a two-part output:

```
<thinking>  ≥200 chars of genuine reasoning: deconstruct the claim,
            surface counterexamples, weigh evidence, decide strategy </thinking>
<answer>    ≤600 chars formal output </answer>
```

- `parseAnswer` splits the two channels.
- `sanitizeThinking` strips leaked tool-call/artifact tags.
- The `<thinking>` channel is streamed live via `reasoning_content` / extended-thinking.

**Generalization**: The thinking threshold and answer length are configurable per task type. A collab task might allow 1000-char answers; a roundtable might relax the thinking requirement.

### 6.2 Search (`search`)

Web search for evidence. Three dispatch paths:

| Provider kind | Mechanism | Current implementation |
|---------------|-----------|------------------------|
| Anthropic / Ark | Native server-side search; model searches autonomously | Inside `chat()` in `LLMClient.ts` |
| OpenAI-compatible | `web_search` function tool; multi-turn tool loop (≤4 iterations) | `chatWithTools` in `DebateEngine.ts` |
| Pre-search | Craft a stance-aware query before the main call | Inline in `speak()` |

Results route through `SearchResolver` (Tavily / Serper) and feed back as `tool` messages.

**Generalization**: Search is a skill that any task type can enable/disable per member. A wargame might restrict search to `observer` members only.

### 6.3 Cite (`cite`)

Attach sources to a speech as evidence. Sources flow into the event stream as `cite` events and attach to the originating speech.

```ts
interface Source {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}
```

### 6.4 Cross-reference (`cross-reference`)

System-prompt rule requiring members to explicitly respond to a prior member's specific argument:

```
回应 @[name] 关于「...」的观点
```

**Generalization**: The cross-reference format is task-specific. A roundtable might use "building on @[name]'s idea"; a collab might use "reviewing @[name]'s PR".

### 6.5 Memory (`memory`)

Persist and reload private conversation history:

- **Save**: after each turn, `persistAgentMemory` writes to `sessionStore` (localStorage).
- **Load**: on session resume / continue, `loadMemoryFromStore` restores all members' histories.
- **Reset**: `resetMemory` clears the in-memory map and store for the active session.

### 6.6 Summarize (`summarize`)

Distill a step's viewpoints into a concise digest. Uses a **tiered fallback** mechanism:

1. Strict rewrite (no ≥5-char copy from original, Jaccard < 0.6)
2. Strict retry (emphasize no-copy rule)
3. Loose accept (no ≥10-char copy)
4. Algorithmic de-copy (remove overlapping fragments)
5. Extractive compress (strip boilerplate, take first clause)

**Guarantee**: always returns a summary — never "failed to distill".

---

## 7. Portable Markdown Format

Teams and tasks are serializable to Markdown for sharing, versioning, and re-import.

### 7.1 Team Markdown

```markdown
---
teamId: roster-001
teamName: Strategic Council
createdAt: 2026-06-25T10:00:00Z
sharedContext: |
  This team evaluates product decisions from multiple angles.
  All members must cite evidence and concede when out-argued.
---

# Members

## Idealist

- **role**: advocate
- **stance**: pro
- **oneLiner**: Long-termism · value-driven
- **focus**: [long-term value, vision alignment, ethics, social impact]
- **tone**: Passionate · poetic · inspiring
- **skills**: [reason, search, cite, cross-reference, memory]
- **description**: |
  Believes in long-term value and positive social impact. Prioritizes
  vision, mission, and sustainability when evaluating any proposal.

## Skeptic

- **role**: challenger
- **stance**: con
- **oneLiner**: Contrarian · evidence-first
- **focus**: [risk assessment, cognitive bias, counterexamples, falsification]
- **tone**: Cool · sharp · question-driven
- **skills**: [reason, search, cite, cross-reference, memory]
- **description**: |
  Instinctively skeptical of "too good to be true" proposals. Always asks
  "what if it fails?", "what's the evidence?", "any counterexamples?".

<!-- ... more members ... -->
```

### 7.2 Task Markdown

```markdown
---
taskId: debate-2026-06-25-001
taskType: debate
teamId: roster-001
topic: Should we adopt microservices for our monolith?
background: |
  Current system: 2-year-old Rails monolith, 50k LOC, 8 engineers.
  Growth: 3x traffic expected in 12 months.
config:
  maxRounds: 5
  enableSearch: true
  thinkingMinChars: 200
  answerMaxChars: 600
startedAt: 2026-06-25T10:00:00Z
totalElapsedMs: 183000
---

# Loop

## Step 0: Brainstorm (diverge)
- mode: parallel
- skills: [reason, search, cite]
- onComplete: auto

## Step 1-5: Debate Rounds (converge)
- mode: sequential
- skills: [reason, search, cite, cross-reference]
- onComplete: auto

## Step 6: Report (synthesize)
- mode: system-only
- skills: [summarize]
- onComplete: manual

# Results

## TL;DR
[trajectory + convergence trend]

## Consensus
1. ...

## Disagreements
1. ...

## Actions
1. ...
```

### 7.3 Import / Export

| Direction | Format | Method |
|-----------|--------|--------|
| Export team | Markdown | Serialize `Team` to frontmatter + member sections |
| Import team | Markdown | Parse frontmatter + member sections → `Team` object → `useRosterStore` |
| Export task | Markdown | Serialize `Task` + `Speech[]` + `StepSummary[]` → full record |
| Import task | Markdown | Parse → restore session state, memory, speeches |

---

## 8. Data Model (TypeScript)

```ts
// ── Team ──
interface Team {
  id: string;
  name: string;
  members: Member[];
  sharedContext: string;
  createdAt: number;
}

// ── Member ──
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

// ── Task ──
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
  // task-type-specific extensions
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

// ── Speech ──
interface Speech {
  id: string;
  step: number;
  memberId: string;
  stance: Stance;
  text: string;
  sources?: Source[];
  ts: number;
}

// ── Step Summary ──
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

// ── Report ──
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

## 9. Extension Guide

### 9.1 Adding a New Task Type

1. **Define the loop**: choose phases (e.g. wargame: `setup → strike → defend → assess → synthesize`).
2. **Implement `TaskRunner`**: create `WargameRunner` implementing the interface in §5.
3. **Register the runner**: add to the runner registry so the engine can dispatch by `TaskType`.
4. **Define stances**: if the task uses non-pro/con stances (e.g. `attacker`/`defender`), extend the `Stance` type or map them to pro/con/neutral internally.
5. **Define convergence**: implement a task-specific convergence function (e.g. threat coverage ratio for wargame).
6. **Define report schema**: extend `Report` with task-specific fields if needed.
7. **Add Markdown serialization**: ensure the task can be exported/imported.

### 9.2 Adding a New Skill

1. **Implement the `Skill` interface** (see §2.5).
2. **Register the skill** in the skill catalog.
3. **Reference in member profiles**: add the skill ID to `Member.skills[]`.
4. **Reference in loop steps**: add the skill ID to `LoopStep.skills[]` to enable it per-step.

### 9.3 Adding a New Member Role

1. Extend `MemberRole` with the new role.
2. Define how the role interacts with the loop (e.g. a `reviewer` role only acts in review steps).
3. Update the system-prompt builder to incorporate role-specific instructions.

---

## 10. Current Implementation Mapping

This table maps the current debate implementation to the abstractions in this spec:

| Abstraction | Current code | Generalized location |
|-------------|-------------|---------------------|
| Team | `useRosterStore.agents` | `Team` object |
| Member | `Persona` + `RosterAgent` | `Member` (merged) |
| MemberRole | Implicit (derived from `stance`) | Explicit `MemberRole` field |
| Task | `Session` (debate-only) | `Task` (typed) |
| TaskType | Hardcoded `'debate'` | `TaskType` union |
| TaskRunner | `DebateEngine` (all-in-one) | `TaskRunner` interface + `DebateRunner` |
| Loop | Hardcoded in `DebateEngine` | `LoopStep[]` on `Task` |
| Phase | `Phase` in `types/index.ts` | Same, generalized names |
| Skill: reason | `buildSystemPrompt` + `parseAnswer` | `ReasonSkill` |
| Skill: search | `SearchResolver` + `chatWithTools` | `SearchSkill` |
| Skill: cite | `Source[]` on `Speech` | `CiteSkill` |
| Skill: cross-reference | System-prompt rule #2 | `CrossReferenceSkill` |
| Skill: memory | `sessionMemory` + `persistAgentMemory` | `MemorySkill` |
| Skill: summarize | `summarizeRound` | `SummarizeSkill` |
| Event | `DebateEvent` | `TaskEvent` (renamed) |
| StepSummary | `RoundSummary` | `StepSummary` (renamed) |
| Report | `FinalReport` | `Report` (renamed) |
| Convergence | `computeConvergence` in `convergence.ts` | Task-specific convergence function |
| Markdown export | `ReportBuilder.toMarkdown` | Extended to team + task serialization |

---

## 11. Roadmap

1. **Refactor `DebateEngine` → `DebateRunner`**: extract the debate-specific logic into a class implementing `TaskRunner`, leaving a generic `Engine` that dispatches by task type.
2. **Merge `Persona` + `RosterAgent` → `Member`**: unify the two types into a single member definition with explicit `role` and `skills`.
3. **Add `LoopStep[]` to `Task`**: make the loop declarative rather than hardcoded in the engine.
4. **Implement team/task Markdown serialization**: export/import via frontmatter + structured sections.
5. **Implement `WargameRunner`**: first non-debate task type to validate the abstraction.
6. **Skill plugin system**: register skills dynamically; allow custom skills per task type.
