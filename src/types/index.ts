export type Phase = 'idle' | 'brainstorm' | 'debate' | 'report';

export type AgentStance = 'pro' | 'con' | 'neutral';
export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'searching'
  | 'speaking'
  | 'paused';

export interface Source {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

export interface Persona {
  id: string;
  name: string;
  emoji: string;
  gradient: [string, string];
  oneLiner: string;
  description: string;
  focus: string[];
  tone: string;
  stance: AgentStance;
}

export interface RosterAgent {
  id: string;
  personaId: string;
  custom?: Partial<Persona>;
  status: AgentStatus;
}

export type EventType =
  | 'think'
  | 'speak'
  | 'search'
  | 'cite'
  | 'interrupt'
  | 'round-summary'
  | 'system';

export interface DebateEvent {
  id: string;
  ts: number;
  agentId: string;
  type: EventType;
  payload: {
    text?: string;
    sources?: Source[];
    round?: number;
    subText?: string;
  };
}

export interface Speech {
  id: string;
  round: number;
  agentId: string;
  stance: AgentStance;
  text: string;
  sources?: Source[];
  ts: number;
}

export interface RoundViewpoint {
  agentId: string;
  name: string;
  stance: AgentStance;
  /** 一句话核心观点（≤40 字，可能截断），由系统每轮总结生成 */
  viewpoint: string;
  /** 完整未截断的提炼观点，供展开查看 */
  viewpointFull?: string;
  evidenceCount: number;
}

export interface RoundSummary {
  /** 0 = Brainstorm，1..N = Debate 轮次 */
  round: number;
  title: string;
  /** 本轮观点演进 / 交锋的一句话总结 */
  digest: string;
  viewpoints: RoundViewpoint[];
  /** 本轮议题收敛度 ∈ [0,1] */
  convergence: number;
}

export interface Session {
  id: string;
  title: string;
  titleEdited: boolean;
  question: string;
  background?: string;
  phase: Phase;
  events: DebateEvent[];
  speeches: Speech[];
  /** 每轮系统总结的观点演进（按轮次生成） */
  roundSummaries: RoundSummary[];
  currentRound: number;
  maxRounds: number;
  startedAt: number;
  paused: boolean;
}

/** 持久化的 Agent 记忆消息（简化版，只保留 role + content） */
export interface MemoryMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Agent 记忆映射：agentId → 对话历史 */
export type AgentMemory = Record<string, MemoryMessage[]>;

export interface FinalReport {
  sessionId: string;
  generatedAt: number;
  tldr: string;
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
  /** 每轮观点演进总结（透传自 session，供报告演进图直接消费） */
  roundSummaries?: RoundSummary[];
}

export interface ProviderConfig {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enableSearch: boolean;
  enabled: boolean;
}

export type ProviderTemplate = 'openai' | 'anthropic' | 'deepseek' | 'moonshot' | 'ark-coding' | 'ollama' | 'custom';
