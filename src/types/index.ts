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

export interface Session {
  id: string;
  question: string;
  background?: string;
  phase: Phase;
  events: DebateEvent[];
  speeches: Speech[];
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
