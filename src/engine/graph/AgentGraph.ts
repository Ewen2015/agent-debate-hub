/**
 * AgentGraph — LangGraph 子图，重构自原 DebateEngine.speak() + chatWithTools()。
 *
 * 3 节点：
 *  - searchPrep：预检索（非 Anthropic provider 的前置 web_search）+ Anthropic 联网指令。
 *    逻辑搬迁自原 speak() L1120-1174。对 state.messages（=history）原地追加预检索 user 消息，
 *    与重构前行为一致。
 *  - llmCall：单次 LLM 调用（原 chatWithTools 循环体 L462-487）。复用 LLMClient.chat。
 *    工具循环在 workingMessages（history 的副本）上运行，不污染 history —— 与原 chatWithTools
 *    `let m = [...messages]` 语义一致；只有最终 final 由 DebateEngine push 进 history。
 *  - toolExec：执行 web_search tool calls（原 L501-532），复用 SearchResolver.resolveSource。
 *
 * 最多 4 次 LLM 迭代（原 for i<4）。
 * 所有节点用 trace?.span/generation 上报 Langfuse（未配置时无副作用）。
 */

import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { LangfuseGenerationClient, LangfuseTraceClient } from 'langfuse';
import { chat, type ChatMessage, type LLMConfig, type LLMResponse } from '@/engine/LLMClient';
import { isSearchResolverConfigured, resolveSource } from '@/engine/SearchResolver';
import type { AgentStance, RosterAgent, Source } from '@/types';
import type { AgentGraphInput, AgentGraphResult, AgentGraphState } from './types';

/** Provider 类型探测，与原 speak() / LLMClient.detectKind 保持一致。 */
const detectKind = (baseUrl: string): 'anthropic' | 'ark-coding' | 'openai' => {
  if (baseUrl.includes('anthropic.com')) return 'anthropic';
  if (baseUrl.includes('ark.cn-beijing.volces.com')) return 'ark-coding';
  return 'openai';
};

const MAX_ITERATIONS = 4;

// ── State schema：全部 LastValue（标量覆盖），保持 messages 原地引用契约 ──
const graphState = Annotation.Root({
  // 输入
  messages: Annotation<ChatMessage[]>(),
  cfg: Annotation<LLMConfig>(),
  agent: Annotation<RosterAgent>(),
  agentName: Annotation<string>(),
  stance: Annotation<AgentStance>(),
  round: Annotation<number>(),
  sessionId: Annotation<string>(),
  question: Annotation<string>(),
  background: Annotation<string | undefined>(),
  lastOpponentText: Annotation<string | undefined>(),
  abort: Annotation<AbortSignal>(),
  trace: Annotation<LangfuseTraceClient | undefined>(),
  retry: Annotation<boolean | undefined>(),
  onReasoning: Annotation<(r: string) => void>(),
  onCite: Annotation<(sources: Source[], kind?: 'cite' | 'search') => void>(),
  onSearchNoKey: Annotation<() => void>(),
  // 累积
  preSources: Annotation<Source[]>(),
  sources: Annotation<Source[]>(),
  reasoning: Annotation<string>(),
  final: Annotation<string>(),
  iteration: Annotation<number>(),
  pendingToolCalls: Annotation<NonNullable<LLMResponse['toolCalls']> | undefined>(),
  lastResponse: Annotation<LLMResponse | undefined>(),
  lastGenClient: Annotation<LangfuseGenerationClient | undefined>(),
  workingMessages: Annotation<ChatMessage[]>(),
});

const DEFAULTS = {
  preSources: [] as Source[],
  sources: [] as Source[],
  reasoning: '',
  final: '',
  iteration: 0,
  pendingToolCalls: undefined,
  lastResponse: undefined,
  lastGenClient: undefined,
  workingMessages: [] as ChatMessage[],
};

// ── 节点 1：searchPrep ──
async function searchPrepNode(state: typeof graphState.State): Promise<Partial<typeof graphState.State>> {
  const cfg = state.cfg;
  const kind = detectKind(cfg.baseUrl);
  const messages = state.messages; // history 引用，原地追加

  // 重试路径：speak 已追加 nudge 消息，跳过预检索，直接进入工具循环
  if (state.retry) {
    return { messages, workingMessages: [...messages] };
  }

  const searchReady = cfg.enableSearch && (kind === 'anthropic' || isSearchResolverConfigured());
  const preSources: Source[] = [];
  const span = state.trace?.span({ name: 'search-prep', input: { kind, searchReady } });

  if (kind !== 'anthropic' && searchReady) {
    const query = [
      state.question,
      state.background ? `背景：${state.background}` : '',
      state.lastOpponentText ? `对方观点：${state.lastOpponentText.slice(0, 80)}` : '',
      '最新 数据 报告 案例',
    ]
      .filter(Boolean)
      .join('；');

    const resolved = await resolveSource(query, 365);
    if (resolved.length) {
      preSources.push(...resolved);
      state.onCite(resolved, 'cite');
      messages.push({
        role: 'user',
        content:
          `以下为联网检索结果（请引用来源；不要编造）：\n\n` +
          resolved
            .map((s) => `【${s.title}】 ${s.url}（${s.domain}）\n摘要：${s.snippet || ''}`)
            .join('\n\n'),
      });
    }
  } else if (kind === 'anthropic' && searchReady) {
    messages.push({
      role: 'user',
      content: '在输出 <answer> 之前，请尝试调用 web_search 获取最新资料，并在回答中引用来源。',
    });
  } else if (cfg.enableSearch && kind !== 'anthropic' && !isSearchResolverConfigured()) {
    state.onSearchNoKey();
  }

  span?.update({ output: { preSources: preSources.length } });
  return {
    messages, // 同一引用，标量覆盖
    preSources,
    // 工具循环在副本上运行，不污染 history
    workingMessages: [...messages],
  };
}

// ── 节点 2：llmCall ──
async function llmCallNode(state: typeof graphState.State): Promise<Partial<typeof graphState.State>> {
  if (state.abort.aborted) throw new Error('aborted');

  const iteration = state.iteration + 1;
  const resp = await chat(state.cfg, state.workingMessages, {
    signal: state.abort,
    onReasoning: (r) => {
      // 累计最新 reasoning（原 aggregatedReasoning），不直接推事件
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      state.reasoning = r;
    },
  });
  // 推送一次 think 事件（原 onReasoning(resp.reasoning || '')）
  state.onReasoning(resp.reasoning || '');

  const gen = state.trace?.generation({
    name: `llm-call-iter-${iteration}`,
    model: state.cfg.model,
    input: state.workingMessages,
    output: resp.content,
    usage: resp.usage
      ? { input: resp.usage.promptTokens, output: resp.usage.completionTokens }
      : undefined,
    metadata: {
      iteration,
      hasReasoning: !!resp.reasoning,
      toolCalls: resp.toolCalls?.length ?? 0,
      providerKind: detectKind(state.cfg.baseUrl),
    },
  });

  const sources = [...state.sources];

  // Anthropic 原生搜索来源
  if (resp.sources?.length) {
    const mapped: Source[] = resp.sources.map((s) => ({
      title: s.title,
      url: s.url,
      domain: s.domain,
      snippet: s.snippet || '',
    }));
    sources.push(...mapped);
    state.onCite(mapped, 'search');
  }

  // 无 tool_calls → 终止
  if (!resp.toolCalls?.length) {
    gen?.update({ metadata: { terminated: true } });
    return {
      final: resp.content,
      reasoning: state.reasoning,
      lastResponse: resp,
      sources,
      pendingToolCalls: undefined,
      lastGenClient: gen,
      iteration,
    };
  }

  // 有 tool_calls → 追加 assistant 消息，转 toolExec
  const workingMessages: ChatMessage[] = [
    ...state.workingMessages,
    {
      role: 'assistant',
      content: resp.content || '',
      tool_calls: resp.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    },
  ];
  return {
    workingMessages,
    lastResponse: resp,
    pendingToolCalls: resp.toolCalls,
    lastGenClient: gen,
    sources,
    iteration,
  };
}

// ── 节点 3：toolExec ──
async function toolExecNode(state: typeof graphState.State): Promise<Partial<typeof graphState.State>> {
  const workingMessages = [...state.workingMessages];
  const sources = [...state.sources];
  const toolCalls = state.pendingToolCalls ?? [];

  for (const tc of toolCalls) {
    if (tc.name !== 'web_search') continue;
    const query = (tc.arguments as any)?.query || '';
    const recency = (tc.arguments as any)?.recency_days;
    // 嵌套在触发它的 llm-call generation 之下（gen.span 自动设 parentObservationId），
    // 退而求其次平铺在 trace 下。体现「多步操作正确嵌套」的最佳实践。
    const parent = state.lastGenClient ?? state.trace;
    const span = parent?.span({
      name: 'web-search',
      input: { query, recency },
      metadata: { toolCallId: tc.id },
    });
    const resolved = await resolveSource(query, recency);
    if (resolved.length) {
      sources.push(...resolved);
      state.onCite(resolved, 'cite');
    }
    span?.update({ output: { sources: resolved.length } });

    const toolResult = resolved
      .map((s) => `【${s.title}】 ${s.url}（${s.domain}）\n摘要：${s.snippet || ''}`)
      .join('\n\n');
    workingMessages.push({
      role: 'tool',
      tool_call_id: tc.id,
      name: 'web_search',
      content: toolResult || '（未检索到相关资料）',
    });
  }

  return { workingMessages, sources };
}

// ── 路由：llmCall 后 ──
function routeAfterLlm(state: typeof graphState.State): 'toolExec' | typeof END {
  if (state.pendingToolCalls?.length && state.iteration < MAX_ITERATIONS) {
    return 'toolExec';
  }
  return END;
}

// ── 编译子图（模块单例） ──
const workflow = new StateGraph(graphState)
  .addNode('searchPrep', searchPrepNode)
  .addNode('llmCall', llmCallNode)
  .addNode('toolExec', toolExecNode)
  .addEdge(START, 'searchPrep')
  .addEdge('searchPrep', 'llmCall')
  .addConditionalEdges('llmCall', routeAfterLlm, { toolExec: 'toolExec', [END]: END })
  .addEdge('toolExec', 'llmCall');

export const agentGraph = workflow.compile();

/**
 * 运行 agent 子图。供 speak() 调用。
 * 返回 { final, sources, reasoning }，sources 已合并 preSources + 工具来源。
 */
export async function runAgentGraph(input: AgentGraphInput): Promise<AgentGraphResult> {
  const stateInput: AgentGraphState = {
    ...input,
    ...DEFAULTS,
  };
  const result = await agentGraph.invoke(stateInput);
  return {
    final: (result.final ?? result.lastResponse?.content ?? '').toString(),
    sources: [...(result.preSources ?? []), ...(result.sources ?? [])],
    reasoning: result.reasoning ?? '',
  };
}
