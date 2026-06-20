/**
 * DebateEngine — 真实多 Agent 辩论引擎
 *
 * 核心设计：
 *  1. 每个 Agent 独立维护 ChatMessage[] 历史，跨轮次保留，持久化到 localStorage
 *  2. 真实 LLM 调用（OpenAI / Anthropic / Ark Coding Plan），不使用 Mock 模板
 *  3. 联网搜索：
 *     - Anthropic / Ark：原生联网，模型自主搜索
 *     - 其他 OpenAI 兼容：function tool + Tavily/Serper
 *  4. 思考过程：通过 <thinking> 标签 + reasoning_content 双通道获取
 *  5. 立场 prompt 与对方发言交叉引用，鼓励"真辩论"
 *  6. 配置缺失时抛出明确错误，不静默降级
 */

import { resolvePersona } from '@/engine/MockLLM';
import { chat, describeLLMError, LLMError, type ChatMessage, type LLMConfig } from '@/engine/LLMClient';
import { resolveLLMConfig } from '@/engine/LLMConfig';
import { useRosterStore } from '@/store/staticStores';
import { useSessionStore } from '@/store/sessionStore';
import type { DebateEvent, RosterAgent, Source, Speech } from '@/types';
import { isSearchResolverConfigured, resolveSource } from '@/engine/SearchResolver';

const uid = () => Math.random().toString(36).slice(2, 11);
const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

// 每个频道内每个 Agent 的独立历史：sessionId -> (agentId -> messages[])
const sessionMemory = new Map<string, Map<string, ChatMessage[]>>();
// 每个频道的用户介入队列
const sessionInterruptBuffers = new Map<string, string[]>();

const getActiveSessionId = () => useSessionStore.getState().activeSessionId;
const getMemoryForCurrentSession = () => {
  const sessionId = getActiveSessionId();
  if (!sessionMemory.has(sessionId)) {
    sessionMemory.set(sessionId, new Map());
  }
  return sessionMemory.get(sessionId)!;
};
const getInterruptBuffer = () => {
  const sessionId = getActiveSessionId();
  if (!sessionInterruptBuffers.has(sessionId)) {
    sessionInterruptBuffers.set(sessionId, []);
  }
  return sessionInterruptBuffers.get(sessionId)!;
};

/**
 * 校验 LLM 配置是否可用。不可用则抛出明确错误。
 */
export function validateLLMConfig(): { ok: boolean; error?: string } {
  const cfg = getLLMConfig();
  if (!cfg) {
    return { ok: false, error: '未配置 LLM Provider。请在 Gateway 面板中添加并配置一个 Provider（填入 API Key、Base URL、Model），或在 .env.local 中设置 VITE_LLM_API_KEY / VITE_LLM_BASE_URL / VITE_LLM_MODEL。' };
  }
  if (!cfg.apiKey || cfg.apiKey.trim().length < 5) {
    return { ok: false, error: 'API Key 为空或过短。请在 Gateway 面板中填入有效的 API Key，或在 .env.local 中设置 VITE_LLM_API_KEY。' };
  }
  if (!cfg.baseUrl) {
    return { ok: false, error: 'Base URL 为空。请在 Gateway 面板中填入 Provider 的 API 端点地址。' };
  }
  if (!cfg.model) {
    return { ok: false, error: 'Model 名称为空。请在 Gateway 面板中填入模型名称（如 gpt-4o-mini、claude-3-5-sonnet 等）。' };
  }
  return { ok: true };
}

export const pushHumanInterrupt = (text: string) => {
  const cleaned = text.trim();
  if (!cleaned) return;
  getInterruptBuffer().push(cleaned);
  const { pushEvent } = useSessionStore.getState();
  pushEvent({
    id: uid(),
    ts: Date.now(),
    agentId: 'human',
    type: 'interrupt',
    payload: { text: cleaned, subText: '人类主持人' },
  });
};

const getLLMConfig = (): LLMConfig | null => {
  return resolveLLMConfig();
};

const setAgentStatus = (id: string, status: RosterAgent['status']) => {
  useRosterStore.getState().updateAgent(id, { status });
};

const isStopped = () => {
  const ph = useSessionStore.getState().session.phase;
  return ph === 'idle' || ph === 'report';
};

const waitIfPaused = async () => {
  while (useSessionStore.getState().session.paused) {
    await delay(200);
    if (isStopped()) return;
  }
};

/**
 * 重置引擎内存（新会话时调用）。
 * 同时清空 sessionStore 中的持久化记忆。
 */
const resetMemory = () => {
  const sessionId = getActiveSessionId();
  sessionMemory.delete(sessionId);
  getInterruptBuffer().length = 0;
  useSessionStore.getState().clearAgentMemory();
};

/**
 * 把单个 Agent 的内存持久化到 sessionStore（localStorage）。
 * 页面刷新后可通过 loadMemoryFromStore 恢复。
 */
const persistAgentMemory = (agentId: string) => {
  const msgs = getMemoryForCurrentSession().get(agentId);
  if (!msgs) return;
  useSessionStore.getState().setAgentMemory(
    agentId,
    msgs.map((m) => ({ role: m.role, content: m.content })),
  );
};

/**
 * 从 sessionStore 恢复所有 Agent 的内存。
 */
const loadMemoryFromStore = () => {
  const sessionId = getActiveSessionId();
  const stored = useSessionStore.getState().agentMemory[sessionId] || {};
  const memoryMap = new Map<string, ChatMessage[]>();
  for (const [agentId, msgs] of Object.entries(stored)) {
    memoryMap.set(agentId, msgs as ChatMessage[]);
  }
  sessionMemory.set(sessionId, memoryMap);
};

// ── System prompt 构造：人设 + 立场 + 当前议题 + 议事规则 ──
const buildSystemPrompt = (agent: RosterAgent, stance: 'pro' | 'con' | 'neutral') => {
  const persona = resolvePersona(agent);
  const stanceDesc =
    stance === 'pro'
      ? '你的初始立场：支持该议题。请基于证据充分论证，但若被对方驳倒，请诚实调整立场。'
      : stance === 'con'
      ? '你的初始立场：反对该议题。请尖锐地寻找风险、缺陷与反例。'
      : '你的角色：跨立场的事实审稿人 / 协调员 / 数据裁判。优先核实数据、识别逻辑漏洞、调和分歧。';
  return `你是「${persona.name}」，${persona.oneLiner}。

## 详细人设
${persona.description}

## 关注点
${persona.focus.map((f) => `- ${f}`).join('\n')}

## 语气
${persona.tone}

## 立场
${stanceDesc}

## 议事规则（务必遵守）
1. **必须先深度思考再发言**：每次发言前，在 <thinking> 标签中输出至少 200 字的真实思考过程。思考过程必须包含：
   - 拆解议题或对方观点的核心假设
   - 从你的角色视角寻找论据或反例
   - 权衡证据的强弱
   - 决定你的发言策略
   然后在 <answer> 标签中输出正式发言正文（不超过 250 字）。

2. **交叉引用**：发言中必须显式回应前文某一 Agent 的具体观点，使用「回应 @[名字] 关于「...」的观点」格式。如果你是首位发言者，则阐述你的核心论点。

3. **证据优先**：如果提供了联网检索结果，必须在 <answer> 中引用至少 1 条来源。不要凭空捏造数据或引用不存在的来源。

4. **诚实性**：当对方证据更强时，明确说「这一点我需要调整立场」而非诡辩。

5. **推进性**：不要复读自己上轮的论点；要在前文基础上推进、深化或转向新角度。

6. **保持人设**：语气、关注点、价值观必须与上面人设一致，不要变成"和事佬"。

## 输出格式（严格遵守）
<thinking>
你的真实思考过程（至少 200 字，展示你的推理链条）。
</thinking>
<answer>
你的正式发言（不超过 250 字）。
</answer>`;
};

const parseAnswer = (raw: string): { thinking: string; answer: string } => {
  const thinkMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const ansMatch = raw.match(/<answer>([\s\S]*?)<\/answer>/i);
  return {
    thinking: sanitizeThinking(thinkMatch?.[1].trim() || ''),
    answer: ansMatch?.[1].trim() || raw.replace(/<thinking>[\s\S]*?<\/thinking>/i, '').replace(/<\/?answer>/gi, '').trim(),
  };
};

/** 清理思考内容中的工具调用标签和 artifacts */
function sanitizeThinking(text: string): string {
  return text
    // 移除 DSML 工具调用标签（含全角竖线 ｜）
    .replace(/<｜DSML｜\w+｜?[^>]*>([\s\S]*?)<\/｜DSML｜\w+｜?>/g, '')
    .replace(/<\/?｜DSML｜[^>]*>/g, '')
    // 移除残留的 tool_calls / function / parameter XML 标签
    .replace(/<\/?(?:tool_calls|function_call|parameter|invoke|tool_call)[^>]*>/gi, '')
    // 移除空的 <answer> 标签（防止泄露到 thinking）
    .replace(/<\/?answer>/gi, '')
    // 清理多余空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── 多轮 function calling 循环：让 LLM 自己决定搜几次 ──
// 对于 Anthropic / Ark，原生搜索在 chat() 内部完成，不会进入 tool call 循环。
async function chatWithTools(
  cfg: LLMConfig,
  messages: ChatMessage[],
  abort: AbortSignal,
  actorAgentId: string,
  onReasoning: (r: string) => void,
): Promise<{ final: string; reasoning: string; sources: Source[] }> {
  let m = [...messages];
  let aggregatedReasoning = '';
  const sources: Source[] = [];
  for (let i = 0; i < 4; i++) {
    if (abort.aborted) throw new Error('aborted');
    const resp = await chat(cfg, m, { signal: abort, onReasoning: (r) => (aggregatedReasoning = r) });
    onReasoning(resp.reasoning || '');

    // 捕获原生搜索返回的 sources（Anthropic）
    if (resp.sources?.length) {
      const mapped: Source[] = resp.sources.map((s) => ({
        title: s.title,
        url: s.url,
        domain: s.domain,
        snippet: s.snippet || '',
      }));
      sources.push(...mapped);
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: actorAgentId,
        type: 'search',
        payload: { text: '', sources: mapped },
      });
    }

    if (!resp.toolCalls?.length) {
      return { final: resp.content, reasoning: aggregatedReasoning, sources };
    }
    // 把 tool_calls 追加到历史
    m = [
      ...m,
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
    // 执行 web_search（仅 OpenAI 兼容 Provider 会走到这里）
    for (const tc of resp.toolCalls) {
      if (tc.name !== 'web_search') continue;
      const query = (tc.arguments as any).query || '';
      const recency = (tc.arguments as any).recency_days;
      const resolved = await resolveSource(query, recency);
      if (resolved.length) {
        sources.push(...resolved);
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: actorAgentId,
          type: 'cite',
          payload: { text: '', sources: resolved },
        });
      }
      const toolResult = resolved
        .map(
          (s) =>
            `【${s.title}】 ${s.url}（${s.domain}）\n摘要：${s.snippet || ''}`,
        )
        .join('\n\n');
      m = [
        ...m,
        {
          role: 'tool',
          tool_call_id: tc.id,
          name: 'web_search',
          content: toolResult || '（未检索到相关资料）',
        },
      ];
    }
  }
  return { final: m[m.length - 1]?.content || '', reasoning: aggregatedReasoning, sources };
}

const pushEvent = (e: DebateEvent) => {
  useSessionStore.getState().pushEvent(e);
};

export const DebateEngine = {
  resetMemory,
  validateLLMConfig,

  /**
   * Brainstorm：每个 Agent 独立基于人设给出 1-2 个发散观点。
   * system prompt 强约束"先想再说"；每个 Agent 独立消息历史，持久化到 localStorage。
   */
  async startBrainstorm() {
    // 校验 LLM 配置
    const validation = validateLLMConfig();
    if (!validation.ok) {
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: 'system',
        type: 'system',
        payload: { text: `❌ ${validation.error}`, subText: '配置错误' },
      });
      return;
    }

    const { session, setPhase, clearEvents, clearSpeeches } = useSessionStore.getState();
    if (!session.question) return;
    resetMemory();
    clearEvents();
    clearSpeeches();
    setPhase('brainstorm');

    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: { text: `Brainstorm 开始：${session.question}` },
    });

    const cfg = getLLMConfig()!;

    const agents = useRosterStore.getState().agents;
    for (const agent of agents) {
      if (isStopped()) return;
      await waitIfPaused();
      const persona = resolvePersona(agent);

      // 初始化每个 Agent 独立历史
      const sysPrompt = buildSystemPrompt(agent, persona.stance);
      const history: ChatMessage[] = [
        { role: 'system', content: sysPrompt },
        {
          role: 'user',
          content: `议题：「${session.question}」${
            session.background ? `\n\n背景资料：${session.background}` : ''
          }\n\n请基于你的人设，先在 <thinking> 里深度思考（至少 200 字），再用 <answer> 给出 1-2 个发散观点（不超过 250 字）。不要重复前面 Agent 的视角。`,
        },
      ];
      getMemoryForCurrentSession().set(agent.id, history);

      setAgentStatus(agent.id, 'thinking');
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: agent.id,
        type: 'system',
        payload: { text: `${persona.name} 开始分析议题（调用 ${cfg.model}）…`, subText: '调用 LLM' },
      });

      try {
        const result = await speak(agent, history, cfg, /*round*/ 0);
        const { thinking, answer } = parseAnswer(result.final);
        if (thinking) {
          pushEvent({
            id: uid(),
            ts: Date.now(),
            agentId: agent.id,
            type: 'think',
            payload: { text: thinking, subText: '思考' },
          });
        }
        const speech: Speech = {
          id: uid(),
          round: 0,
          agentId: agent.id,
          stance: persona.stance,
          text: answer,
          sources: result.sources,
          ts: Date.now(),
        };
        useSessionStore.getState().pushSpeech(speech);
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: agent.id,
          type: 'speak',
          payload: { text: answer, subText: `${persona.name} 发言`, sources: result.sources },
        });
        // 把 assistant 真实回复加入历史
        history.push({ role: 'assistant', content: result.final });
        // 持久化记忆到 localStorage
        persistAgentMemory(agent.id);
      } catch (e: any) {
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: agent.id,
          type: 'system',
          payload: { text: `${persona.name} 发言失败：${e?.message || '未知错误'}`, subText: '错误' },
        });
      }
      setAgentStatus(agent.id, 'idle');
    }

    if (isStopped()) return;
    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: { text: 'Brainstorm 阶段结束。点击「进入 Debate」开始对抗推演。' },
    });
    setPhase('idle');
  },

  /**
   * Debate：多轮对抗。每一轮：
   *   - 把"前一轮所有 Agent 发言"摘要 + 当前发言请求塞进每个 Agent 的历史
   *   - 调用真实 LLM，prompt 强约束交叉引用与反驳
   *   - 联网搜索（Anthropic/Ark 原生 / 其他 Provider function tool）
   *   - 记忆持久化到 localStorage，跨轮次保留
   */
  async enterDebate() {
    // 校验 LLM 配置
    const validation = validateLLMConfig();
    if (!validation.ok) {
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: 'system',
        type: 'system',
        payload: { text: `❌ ${validation.error}`, subText: '配置错误' },
      });
      return;
    }

    const { session, setPhase, setCurrentRound } = useSessionStore.getState();
    setPhase('debate');
    setCurrentRound(0);

    // 从 sessionStore 恢复 Brainstorm 阶段积累的记忆
    loadMemoryFromStore();

    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: { text: `Debate 开始：共 ${session.maxRounds} 轮，每轮全员对抗推演。` },
    });

    const cfg = getLLMConfig()!;

    for (let r = 1; r <= session.maxRounds; r++) {
      if (isStopped()) return;
      await waitIfPaused();
      setCurrentRound(r);

      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: 'system',
        type: 'system',
        payload: { text: `── 第 ${r} / ${session.maxRounds} 轮 ──` },
      });

      const agents = useRosterStore.getState().agents;
      for (let i = 0; i < agents.length; i++) {
        if (isStopped()) return;
        await waitIfPaused();
        const agent = agents[i];
        const persona = resolvePersona(agent);
        const history = getMemoryForCurrentSession().get(agent.id) || [];
        // 当前 Agent 收到的 user 消息：上一轮他人发言 + 本轮辩论指令
        const recentSpeeches = useSessionStore
          .getState()
          .session.speeches.filter((s) => s.round === r - 1 && s.agentId !== agent.id)
          .map(
            (s) =>
              `「${resolvePersona(agents.find((a) => a.id === s.agentId)!).name}」说：${
                s.text
              }${s.sources?.length ? `\n引用：${s.sources.map((x) => x.title).join('；')}` : ''}`,
          )
          .join('\n\n');

        const interruptNote =
          getInterruptBuffer().length
            ? `\n\n人类主持人最新指令：${getInterruptBuffer()[getInterruptBuffer().length - 1]}`
            : '';

        const userMsg: ChatMessage = {
          role: 'user',
          content: `进入第 ${r} 轮。${
            recentSpeeches ? `\n\n上一轮他人发言：\n${recentSpeeches}` : '你是本轮第一位发言者。'
          }${interruptNote}\n\n请按你的角色立场：\n- 在 <thinking> 中深度反驳或推进（至少 200 字，必须显式回应对方至少一个观点）\n- 在 <answer> 中输出 250 字内的正式发言\n- 必要时调用 web_search 检索最新数据/案例\n- 不要复读你之前的论点`,
        };
        history.push(userMsg);

        setAgentStatus(agent.id, 'thinking');
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: agent.id,
          type: 'system',
          payload: { text: `${persona.name} 第 ${r} 轮分析中（调用 ${cfg.model}）…`, subText: '调用 LLM' },
        });

        try {
          const result = await speak(agent, history, cfg, r);
          const { thinking, answer } = parseAnswer(result.final);
          if (thinking) {
            pushEvent({
              id: uid(),
              ts: Date.now(),
              agentId: agent.id,
              type: 'think',
              payload: { text: thinking, subText: '思考' },
            });
          }
          const speech: Speech = {
            id: uid(),
            round: r,
            agentId: agent.id,
            stance: persona.stance,
            text: answer,
            sources: result.sources,
            ts: Date.now(),
          };
          useSessionStore.getState().pushSpeech(speech);
          pushEvent({
            id: uid(),
            ts: Date.now(),
            agentId: agent.id,
            type: 'speak',
            payload: { text: answer, subText: `${persona.name} 发言`, sources: result.sources },
          });
          history.push({ role: 'assistant', content: result.final });
          // 持久化记忆
          persistAgentMemory(agent.id);
        } catch (e: any) {
          pushEvent({
            id: uid(),
            ts: Date.now(),
            agentId: agent.id,
            type: 'system',
            payload: { text: `${persona.name} 失败：${e?.message || '未知错误'}`, subText: '错误' },
          });
        }
        setAgentStatus(agent.id, 'idle');
      }

      if (isStopped()) return;
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: 'system',
        type: 'system',
        payload: { text: `第 ${r} 轮结束。` },
      });
      await delay(400);
    }

    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: { text: '全部轮次结束。可点击「生成报告」汇总结论。' },
    });
  },

  pause() {
    useSessionStore.getState().setPaused(true);
  },
  resume() {
    useSessionStore.getState().setPaused(false);
  },
  async stop() {
    useSessionStore.getState().setPaused(false);
    useSessionStore.getState().setPhase('idle');
    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: { text: '会话被中止。' },
    });
    for (const a of useRosterStore.getState().agents) setAgentStatus(a.id, 'idle');
  },
};

interface SpeakResult {
  final: string;
  sources: Source[];
}

/**
 * 调用真实 LLM。不使用 Mock 模式。
 * 如果 LLM 不可用，抛出错误并在事件流中提示。
 */
async function speak(
  agent: RosterAgent,
  history: ChatMessage[],
  cfg: LLMConfig,
  round: number,
): Promise<SpeakResult> {
  const ctrl = new AbortController();
  try {
    const kind =
      cfg.baseUrl.includes('anthropic.com')
        ? 'anthropic'
        : cfg.baseUrl.includes('ark.cn-beijing.volces.com')
        ? 'ark-coding'
        : 'openai';

    const session = useSessionStore.getState().session;
    const persona = resolvePersona(agent);
    const preSources: Source[] = [];

    // 联网检索（可选）：Anthropic 原生联网；其他 Provider 需配置 Tavily/Serper
    const searchReady = cfg.enableSearch && (kind === 'anthropic' || isSearchResolverConfigured());

    if (kind !== 'anthropic' && searchReady) {
      const lastOpponent = session.speeches
        .slice()
        .reverse()
        .find((s) => s.agentId !== agent.id && s.round === round)?.text;
      const query = [
        session.question,
        session.background ? `背景：${session.background}` : '',
        lastOpponent ? `对方观点：${lastOpponent.slice(0, 80)}` : '',
        '最新 数据 报告 案例',
      ]
        .filter(Boolean)
        .join('；');

      const resolved = await resolveSource(query, 365);
      if (resolved.length) {
        preSources.push(...resolved);
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: agent.id,
          type: 'cite',
          payload: { text: '', sources: resolved },
        });
        history.push({
          role: 'user',
          content:
            `以下为联网检索结果（请引用来源；不要编造）：\n\n` +
            resolved
              .map((s) => `【${s.title}】 ${s.url}（${s.domain}）\n摘要：${s.snippet || ''}`)
              .join('\n\n'),
        });
      }
    } else if (kind === 'anthropic' && searchReady) {
      history.push({
        role: 'user',
        content:
          '在输出 <answer> 之前，请尝试调用 web_search 获取最新资料，并在回答中引用来源。',
      });
    } else if (cfg.enableSearch && kind !== 'anthropic' && !isSearchResolverConfigured()) {
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: 'system',
        type: 'system',
        payload: { text: '未配置搜索 Key，跳过联网检索' },
      });
    }

    const runOnce = async () =>
      chatWithTools(cfg, history, ctrl.signal, agent.id, (r: string) => {
        if (r) {
          pushEvent({
            id: uid(),
            ts: Date.now(),
            agentId: agent.id,
            type: 'think',
            payload: { text: r, subText: `${persona.name} 实时思考` },
          });
        }
      });

    let result = await runOnce();
    // 对 Anthropic 且已开启搜索：若未返回 sources，提示一次并重试
    if (searchReady && kind === 'anthropic' && result.sources.length === 0) {
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: agent.id,
        type: 'system',
        payload: { text: '未返回联网来源，重新检索一次', subText: '补充检索' },
      });
      history.push({
        role: 'user',
        content: '你上一轮没有返回任何 sources。请使用 web_search 获取至少 1 条来源，并在 <answer> 中引用。',
      });
      result = await runOnce();
    }

    return { final: result.final, sources: [...preSources, ...result.sources] };
  } catch (e: any) {
    if (e instanceof LLMError) {
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: 'system',
        type: 'system',
        payload: { text: describeLLMError(e), subText: 'LLM 错误' },
      });
    }
    throw e;
  }
}
