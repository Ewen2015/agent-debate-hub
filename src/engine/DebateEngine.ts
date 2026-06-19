/**
 * 重写后的 DebateEngine
 *
 * 关键变化（vs. v0.1 demo）：
 *  1. 每个 Agent 独立维护 ChatMessage[] 历史，跨轮次保留
 *  2. 真实 LLM 调用（OpenAI / Anthropic / Ark Coding Plan）
 *  3. 把 web_search 工具交给 LLM 自主决定何时检索
 *  4. 思考过程 (reasoning_content) 作为独立事件流，可视化展示
 *  5. 立场 prompt 与对方发言交叉引用，鼓励"真辩论"
 *  6. 失败可重试、可降级为 Mock（仅当 LLM 不可用时）
 */

import { resolvePersona } from '@/engine/MockLLM';
import { chat, LLMError, type ChatMessage, type LLMConfig } from '@/engine/LLMClient';
import { useRosterStore } from '@/store/staticStores';
import { useGatewayStore } from '@/store/staticStores';
import { useSessionStore } from '@/store/sessionStore';
import type { DebateEvent, RosterAgent, Source, Speech } from '@/types';
import { resolveSource } from '@/engine/SearchResolver';

const uid = () => Math.random().toString(36).slice(2, 11);
const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

// 每个 Agent 的独立对话历史。key: agentId, value: messages[]
const memory: Map<string, ChatMessage[]> = new Map();
// Agent 的最后已知来源索引（用于 sources 持久化）
const lastSources: Map<string, Source[]> = new Map();
// 用户介入队列
const interruptBuffer: string[] = [];

const newSessionId = () => Math.random().toString(36).slice(2, 10);

export const pushHumanInterrupt = (text: string) => {
  const cleaned = text.trim();
  if (!cleaned) return;
  interruptBuffer.push(cleaned);
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
  const store = useGatewayStore.getState();
  const cur = store.providers.find((p) => p.id === store.activeProviderId);
  if (!cur) return null;
  // 优先使用 env 注入的 key（更安全），其次用户输入
  const envKey = (import.meta as any).env?.VITE_LLM_API_KEY as string | undefined;
  const envBase = (import.meta as any).env?.VITE_LLM_BASE_URL as string | undefined;
  const envModel = (import.meta as any).env?.VITE_LLM_MODEL as string | undefined;
  return {
    baseUrl: envBase || cur.baseUrl,
    apiKey: envKey || cur.apiKey,
    model: envModel || cur.model,
    temperature: cur.temperature,
    maxTokens: cur.maxTokens,
    enableSearch: cur.enableSearch,
  };
};

const isMock = (cfg: LLMConfig | null) =>
  !cfg || !cfg.apiKey || cfg.apiKey.startsWith('mock');

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

const resetMemory = () => {
  memory.clear();
  lastSources.clear();
  interruptBuffer.length = 0;
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
1. **每一轮发言都必须先思考再回答**：在 <thinking>...</thinking> 标签中输出 100-300 字的真实思考过程（拆解对方观点、寻找反例、检索资料、权衡论据）。思考后再用 <answer>...</answer> 标签输出正式发言正文（不超过 200 字）。
2. **交叉引用**：发言中必须显式回应前文某一 Agent 的具体观点，使用「回应 @[名字] 关于「...」的观点」格式。
3. **数据优先**：涉及数字时给出量级与来源倾向（如「据 2024 年 Gartner 报告」）。
4. **诚实性**：当对方证据更强时，明确说「这一点我需要调整立场」而非诡辩。
5. **不要重复**：不要复读自己上轮的论点；要在前文基础上推进。
6. **保持人设**：语气、关注点、价值观必须与上面人设一致，不要变成"和事佬"。

## 输出格式（严格遵守）
<thinking>
你的真实思考过程。
</thinking>
<answer>
你的正式发言。
</answer>`;
};

const parseAnswer = (raw: string): { thinking: string; answer: string } => {
  const thinkMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const ansMatch = raw.match(/<answer>([\s\S]*?)<\/answer>/i);
  return {
    thinking: thinkMatch?.[1].trim() || '',
    answer: ansMatch?.[1].trim() || raw.trim(),
  };
};

// ── 多轮 function calling 循环：让 LLM 自己决定搜几次 ──
async function chatWithTools(
  cfg: LLMConfig,
  messages: ChatMessage[],
  abort: AbortSignal,
  onReasoning: (r: string) => void,
): Promise<{ final: string; reasoning: string; sources: Source[] }> {
  let m = [...messages];
  let aggregatedReasoning = '';
  const sources: Source[] = [];
  for (let i = 0; i < 4; i++) {
    if (abort.aborted) throw new Error('aborted');
    const resp = await chat(cfg, m, { signal: abort, onReasoning: (r) => (aggregatedReasoning = r) });
    onReasoning(resp.reasoning || '');
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
    // 执行 web_search
    for (const tc of resp.toolCalls) {
      if (tc.name !== 'web_search') continue;
      const query = (tc.arguments as any).query || '';
      const recency = (tc.arguments as any).recency_days;
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: 'system',
        type: 'system',
        payload: { text: `🔍 触发联网检索：「${query}」` },
      });
      const resolved = await resolveSource(query, recency);
      sources.push(...resolved);
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
  interruptBuffer,
  memory,
  resetMemory,

  /**
   * Brainstorm：每个 Agent 独立基于人设给出 1-2 个发散观点。
   * 真实 LLM 模式下，system prompt 强约束"先想再说"；每个 Agent 独立消息历史。
   */
  async startBrainstorm() {
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

    const cfg = getLLMConfig();
    const mock = isMock(cfg);

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
          }\n\n请基于你的人设，先在 <thinking> 里深度思考（200-300 字），再用 <answer> 给出 1-2 个发散观点（不超过 200 字）。不要重复前面 Agent 的视角。`,
        },
      ];
      memory.set(agent.id, history);

      setAgentStatus(agent.id, 'thinking');
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: agent.id,
        type: 'think',
        payload: { text: `${persona.name} 正在围绕议题深度思考……`, subText: '思考中' },
      });

      try {
        const result = await speak(agent, history, cfg, mock, /*round*/ 0);
        const { thinking, answer } = parseAnswer(result.final || result.fallback);
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
   *   - 真实联网（LLM 自主决定 web_search）
   */
  async enterDebate() {
    const { session, setPhase, setCurrentRound } = useSessionStore.getState();
    setPhase('debate');
    setCurrentRound(0);

    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: { text: `Debate 开始：共 ${session.maxRounds} 轮，每轮全员对抗推演。` },
    });

    const cfg = getLLMConfig();
    const mock = isMock(cfg);

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
        const history = memory.get(agent.id) || [];
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
          interruptBuffer.length
            ? `\n\n人类主持人最新指令：${interruptBuffer[interruptBuffer.length - 1]}`
            : '';

        const userMsg: ChatMessage = {
          role: 'user',
          content: `进入第 ${r} 轮。${
            recentSpeeches ? `\n\n上一轮他人发言：\n${recentSpeeches}` : '你是本轮第一位发言者。'
          }${interruptNote}\n\n请按你的角色立场：\n- 在 <thinking> 中深度反驳或推进（200-300 字，必须显式回应对方至少一个观点）\n- 在 <answer> 中输出 200 字内的正式发言\n- 必要时调用 web_search 检索最新数据/案例（最多 2 次）\n- 不要复读你之前的论点`,
        };
        history.push(userMsg);

        setAgentStatus(agent.id, 'thinking');
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: agent.id,
          type: 'think',
          payload: { text: `${persona.name} 第 ${r} 轮深度思考中……`, subText: '思考中' },
        });

        try {
          const result = await speak(agent, history, cfg, mock, r);
          const { thinking, answer } = parseAnswer(result.final || result.fallback);
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
  fallback: string;
  sources: Source[];
}

/**
 * 实际调用 LLM 或 fallback 到 MockLLM。返回 raw content + 思考 + 来源。
 */
async function speak(
  agent: RosterAgent,
  history: ChatMessage[],
  cfg: LLMConfig | null,
  mock: boolean,
  round: number,
): Promise<SpeakResult> {
  if (!mock && cfg) {
    try {
      const ctrl = new AbortController();
      const result = await chatWithTools(
        cfg,
        history,
        ctrl.signal,
        (r) => {
          if (r) {
            const persona = resolvePersona(agent);
            pushEvent({
              id: uid(),
              ts: Date.now(),
              agentId: agent.id,
              type: 'think',
              payload: { text: r, subText: '思考' },
            });
          }
        },
      );
      return { final: result.final, fallback: result.final, sources: result.sources };
    } catch (e: any) {
      if (e instanceof LLMError) {
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: 'system',
          type: 'system',
          payload: { text: `LLM 错误 (${e.status})，回退到模板生成。`, subText: '降级' },
        });
      }
    }
  }
  // Mock 模式：使用 v0.1 模板但带真实记忆交叉引用
  const { MockLLM } = await import('@/engine/MockLLM');
  const persona = resolvePersona(agent);
  const session = useSessionStore.getState().session;
  const lastOpponent = session.speeches
    .filter((s) => s.round === round - 1 && s.agentId !== agent.id)
    .slice(-1)[0];
  const text = await MockLLM.debate({
    agent,
    persona,
    question: session.question,
    round,
    isOpening: !lastOpponent,
    latestOpponentText: lastOpponent?.text,
    interrupts: [...interruptBuffer].slice(-2),
  });
  return { final: `<thinking>（Mock 模式，无真实思考过程）</thinking>\n<answer>${text}</answer>`, fallback: text, sources: [] };
}
