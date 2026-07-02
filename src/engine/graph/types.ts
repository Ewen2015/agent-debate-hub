/**
 * LangGraph 子图状态类型定义。
 *
 * 设计要点：
 *  - messages 字段就是 DebateEngine 传入的 history 数组引用。
 *    子图节点对 state.messages 的 push 操作会直接反映到外层 history，
 *    保持与重构前 speak() 原地 mutation 的契约一致（DebateEngine 在 speak 后
 *    仍会 history.push({role:'assistant',...})）。
 *    因此 schema 中 messages 用 LastValue（标量覆盖，非 reducer），避免
 *    [...prev,...new] 复制断引用。
 *  - 回调（onReasoning/onCite/onSearchNoKey）沿用现有 pushEvent 事件流，
 *    保证 UI 事件（think/cite/search）与重构前一致。
 *  - trace 为可选 LangfuseTraceClient；未配置 Langfuse 时为 undefined，
 *    节点用 trace?.span(...) 模式无副作用跳过。
 */

import type { LangfuseTraceClient } from 'langfuse';
import type { ChatMessage, LLMConfig, LLMResponse } from '@/engine/LLMClient';
import type { AgentStance, RosterAgent, Source } from '@/types';

export interface AgentGraphCallbacks {
  /** 实时思考过程（reasoning_content / thinking 标签），推送 'think' 事件。 */
  onReasoning: (r: string) => void;
  /** 检索到来源，推送 'cite' / 'search' 事件。 */
  onCite: (sources: Source[], kind?: 'cite' | 'search') => void;
  /** 未配置搜索 Key 的一次性提示。 */
  onSearchNoKey: () => void;
}

export interface AgentGraphInput extends AgentGraphCallbacks {
  /** Agent 的对话历史（原地 mutation，等同 speak 重构前的 history）。 */
  messages: ChatMessage[];
  cfg: LLMConfig;
  agent: RosterAgent;
  agentName: string;
  stance: AgentStance;
  round: number;
  sessionId: string;
  question: string;
  background?: string;
  /** 上一轮对方最后一条发言文本（用于拼检索 query），由 speak 传入。 */
  lastOpponentText?: string;
  abort: AbortSignal;
  /** Langfuse trace（可选）。由 speak() 在 invoke 前创建并传入。 */
  trace?: LangfuseTraceClient;
  /**
   * 重试标记。Anthropic 首次未返回 sources 时，speak 会追加一条 nudge 消息后重跑子图，
   * 此时 retry=true 让 searchPrep 跳过（避免重复推送联网指令），仅做工具循环。
   * 与原 chatWithTools 二次调用的语义对齐。
   */
  retry?: boolean;
}

export interface AgentGraphState extends AgentGraphInput {
  /** 预检索（非 Anthropic provider，speak 前置检索）收集的来源。 */
  preSources: Source[];
  /** 工具循环中累计的来源（含 Anthropic 原生 + web_search 工具）。 */
  sources: Source[];
  /** 累计的 reasoning 文本。 */
  reasoning: string;
  /** 最终 LLM 输出文本。 */
  final: string;
  /** 工具循环计数（0..3，最多 4 次迭代）。 */
  iteration: number;
  /** 上一轮 LLM 响应中待执行的 toolCalls。 */
  pendingToolCalls?: NonNullable<LLMResponse['toolCalls']>;
  /** 上一轮 LLM 响应（用于 toolExec 后取 final）。 */
  lastResponse?: LLMResponse;
}

/** 子图返回结果（与 speak 重构前的 SpeakResult 对齐）。 */
export interface AgentGraphResult {
  final: string;
  sources: Source[];
  reasoning: string;
}
