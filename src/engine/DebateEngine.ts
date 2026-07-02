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
import { stripLLMArtifacts } from '@/engine/textUtils';
import { computeConvergence, jaccard, tokenize } from '@/engine/convergence';
import { chat, describeLLMError, LLMError, type ChatMessage, type LLMConfig } from '@/engine/LLMClient';
import { resolveLLMConfig } from '@/engine/LLMConfig';
import { useRosterStore } from '@/store/staticStores';
import { useSessionStore } from '@/store/sessionStore';
import type { DebateEvent, RosterAgent, RoundSummary, RoundViewpoint, Source, Speech } from '@/types';
import { isSearchResolverConfigured } from '@/engine/SearchResolver';
import { logger, logBreakpoint } from '@/engine/logger';
import { flushLangfuse, getLangfuse } from '@/engine/langfuse';
import { isQualityViewpoint as qualityIsQualityViewpoint, deCopy, extractiveCompress } from '@/engine/viewpointQuality';

const uid = () => Math.random().toString(36).slice(2, 11);
const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/** 毫秒 → 「1分23秒」/「45秒」可读时长。 */
/** 毫秒 → 可读时长。每轮用整数分钟；整体 <1h 用分钟、≥1h 用小时分钟。 */
const formatDuration = (ms: number, mode: 'round' | 'total' = 'round'): string => {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  if (mode === 'round') {
    return `${totalMin} 分钟`;
  }
  // total
  if (totalMin < 60) return `${totalMin} 分钟`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} 小时 ${m} 分钟`;
};

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
  // 重置「未配置搜索 Key」一次性提示标记
  searchKeyMissingNotified = false;
};

// 「未配置搜索 Key」每会话只提示一次，避免对话框冗余
let searchKeyMissingNotified = false;

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
   然后在 <answer> 标签中输出正式发言正文（不超过 600 字）。

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
你的正式发言（不超过 600 字）。
</answer>`;
};

const parseAnswer = (raw: string): { thinking: string; answer: string } => {
  const thinkMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const ansMatch = raw.match(/<answer>([\s\S]*?)<\/answer>/i);
  return {
    thinking: sanitizeThinking(thinkMatch?.[1].trim() || ''),
    // answer 同样需要剥离泄漏的 DSML / 工具调用标签，避免展示给用户
    answer: sanitizeThinking(ansMatch?.[1].trim() || raw.replace(/<thinking>[\s\S]*?<\/thinking>/i, '').replace(/<\/?answer>/gi, '').trim()),
  };
};

/**
 * 清理 LLM 输出中的工具调用标签和 artifacts。
 * thinking 与 answer 共用同一套清洗逻辑，单一事实源在 stripLLMArtifacts。
 */
function sanitizeThinking(text: string): string {
  return stripLLMArtifacts(text)
    // 清理多余空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 每轮结束后由系统总结「本轮观点演进」。
 * 复用主 LLM 配置做一次轻量 chat 调用，要求严格 JSON 输出。
 * 关键：观点必须是「提炼总结」，而非照搬原句。
 *  - prompt 明确禁止复述原文、要求用第三人称概括立场与论点
 *  - 解析后做质量校验：若某条 viewpoint 缺失、或与原文词集 Jaccard 过高（即照搬），
 *    则重试一次；仍不达标则该条标记为「（未能提炼）」，绝不把原话当观点。
 *  - digest 同理，空或雷同则降级为结构化文案。
 */
async function summarizeRound(
  round: number,
  title: string,
  speeches: Speech[],
  agents: RosterAgent[],
  cfg: LLMConfig,
  prevRound: Speech[] = [],
): Promise<RoundSummary> {
  const nameOf = (id: string) => {
    const a = agents.find((x) => x.id === id);
    return a ? resolvePersona(a).name : 'Agent';
  };

  // 收敛度（纯计算，不依赖 LLM）
  const convergence = computeConvergence(speeches, prevRound).score;

  // 降级路径：仅当无发言时使用。有发言时走分级保底机制，必有总结。
  const fallback = (): RoundSummary => ({
    round,
    title,
    digest: speeches.length ? `${title}共 ${speeches.length} 位发言者参与。` : `${title}无发言记录。`,
    convergence,
    viewpoints: speeches.map<RoundViewpoint>((sp) => ({
      agentId: sp.agentId,
      name: nameOf(sp.agentId),
      stance: sp.stance,
      viewpoint: '（无发言内容）',
      evidenceCount: sp.sources?.length ?? 0,
    })),
  });

  if (speeches.length === 0) return fallback();

  const question = useSessionStore.getState().session.question;

  // ── Langfuse round-summary trace（可选，供 eval 目标 #2 / #3 消费）──
  const lf = getLangfuse();
  const sessionId = useSessionStore.getState().activeSessionId;
  const roundTrace = lf?.trace({
    name: `round-summary:${round}`,
    sessionId,
    input: { round, title, question, speechCount: speeches.length, convergence },
    tags: [sessionId, `round-${round}`, 'summary'],
  });

  // 原文文本与词集，用于检测 LLM 是否照搬
  const origTextMap = new Map<string, string>();
  const origTokens = new Map<string, Set<string>>();
  for (const sp of speeches) {
    origTextMap.set(sp.agentId, stripLLMArtifacts(sp.text));
    origTokens.set(sp.agentId, tokenize(sp.text));
  }

  /**
   * 校验单条 viewpoint 质量（照搬检测）—— 委托给共享纯函数 viewpointQuality。
   * 保留按 agentId 查原文/词集的便捷封装，行为与重构前一致。
   */
  const isQualityViewpoint = (
    agentId: string,
    vp: string | undefined,
    minCopyLen = 5,
    maxJaccard = 0.6,
  ): boolean =>
    qualityIsQualityViewpoint(
      vp,
      origTextMap.get(agentId) || '',
      origTokens.get(agentId) ?? new Set(),
      minCopyLen,
      maxJaccard,
    );

  // 带超时的 chat 调用（30s），避免总结阶段卡死整个辩论流程
  const chatWithTimeout = async (system: string, user: string): Promise<string | null> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const resp = await chat(cfg, [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], { signal: ctrl.signal });
      return stripLLMArtifacts(resp.content || '');
    } catch (e) {
      logger.warn('chatWithTimeout', '总结调用失败（静默降级）', { round, error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  /**
   * 并发为每位 Agent 提炼一句观点 —— 分级保底机制，保证一定有总结：
   *  1. 严格改写（无 ≥5 字照搬、Jaccard<0.6）
   *  2. 严格重试（强调禁止照搬）
   *  3. 宽松接受（无 ≥10 字照搬）—— 允许更多重叠，避免误杀合理改写
   *  4. 算法去重：对最佳尝试删除与原文重合片段
   *  5. 提取式压缩兜底：去套话、取首句 —— 永不返回「未能提炼」
   */
  const summarizeOneViewpoint = async (sp: Speech): Promise<RoundViewpoint> => {
    const name = nameOf(sp.agentId);
    const originText = stripLLMArtifacts(sp.text);
    const baseSys = '你是严谨的辩论记录员。把给定发言浓缩成一句核心观点。\n要求：\n1. 用第三人称概括发言者的立场与主张；\n2. 必须用自己的话改写，严禁出现原文中任何连续 5 字以上的原句片段；\n3. 只输出观点本身，不要解释、引号、序号、标点前缀。';

    const extractViewpoint = async (attempt: number): Promise<string | null> => {
      const emphasis = attempt > 0
        ? `\n\n[重要] 你上次的输出与原文过于雷同。请完全换一种表述，只用同义改写，杜绝任何原文连续片段，像在向没读过原文的人转述一样。`
        : '';
      const usr = `议题：${question}\n发言者：${name}（${sp.stance}）\n发言原文：\n${originText}\n\n请提炼一句核心观点（第三人称、用自己的话改写、禁止照搬原句连续片段）：${emphasis}`;
      // Langfuse：每次提炼尝试作为一个 generation，供 eval-viewpoint 评测
      const gen = roundTrace?.generation({
        name: `viewpoint-extraction:${sp.agentId}`,
        model: cfg.model,
        input: { attempt, question, name, stance: sp.stance, originText },
        metadata: { agentId: sp.agentId, attempt },
      });
      const raw = await chatWithTimeout(baseSys, usr);
      if (!raw) {
        gen?.update({ output: null, metadata: { failed: true } });
        return null;
      }
      const line = raw.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0) || raw.trim();
      const vp = line.replace(/^[「『""'']+|[」』""'']+$/g, '').replace(/^(观点|总结|核心观点)[：:]\s*/i, '').trim();
      gen?.update({ output: vp, metadata: { originText, agentId: sp.agentId, attempt } });
      return vp;
    };

    // 三级尝试，记录每级结果
    const attempts: (string | null)[] = [];
    attempts.push(await extractViewpoint(0));
    const strictOk = (v: string | null) => isQualityViewpoint(sp.agentId, v ?? undefined, 5, 0.6);
    if (!strictOk(attempts[0]) && !isStopped()) attempts.push(await extractViewpoint(1));
    const looseOk = (v: string | null) => isQualityViewpoint(sp.agentId, v ?? undefined, 10, 0.8);
    if (attempts.every((v) => !strictOk(v)) && !isStopped()) attempts.push(await extractViewpoint(2));

    // 选最佳：严格通过 > 宽松通过 > 任意非空
    const passed = attempts.find(strictOk) || attempts.find(looseOk) || attempts.find((v) => v && v.trim().length >= 4) || null;

    let finalVp: string;
    if (passed && (strictOk(passed) || looseOk(passed))) {
      // 通过质量门 → 直接用
      finalVp = passed!.replace(/\s+/g, ' ').trim();
    } else if (passed) {
      // 有 LLM 输出但都没过照搬门 → 算法去重
      const cleaned = deCopy(passed!, originText);
      finalVp = cleaned.length >= 6 ? cleaned : extractiveCompress(originText);
    } else {
      // 所有 LLM 尝试失败（网络/超时）→ 提取式压缩兜底
      finalVp = extractiveCompress(originText);
    }

    const fullVp = finalVp.replace(/\s+/g, ' ').trim();
    return {
      agentId: sp.agentId,
      name,
      stance: sp.stance,
      // viewpoint 即完整提炼观点（不再截断）；viewpointFull 保留同值，供历史数据/报告演变图展开兼容
      viewpoint: fullVp,
      viewpointFull: fullVp,
      evidenceCount: sp.sources?.length ?? 0,
    };
  };

  // ── 并发：所有 agent 观点提炼 + digest 总结同时进行 ──
  const transcripts = speeches
    .map((sp) => `【${nameOf(sp.agentId)}（${sp.stance}）】${stripLLMArtifacts(sp.text)}`)
    .join('\n\n');

  const digestTask = (async (): Promise<string> => {
    const sys = '你是严谨的辩论记录员。用一句话总结本轮各发言者观点的演进或交锋。必须用自己的话凝练概括，严禁出现原文中任何连续 5 字以上的原句片段。只输出总结本身。';
    const usr = `议题：${question}\n本轮发言：\n${transcripts}\n\n请用一句话总结本轮观点的演进或交锋：`;
    const raw = await chatWithTimeout(sys, usr);
    let d = (raw || '').split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0) || (raw || '').trim();
    d = d.replace(/^[「『""'']+|[」』""'']+$/g, '').trim();
    const ok = d.length >= 4 && speeches.every((sp) => jaccard(tokenize(d), origTokens.get(sp.agentId) ?? new Set()) < 0.7);
    return ok ? d : `${title}观点总结`;
  })();

  const [viewpoints, digest] = await Promise.all([
    Promise.all(speeches.map(summarizeOneViewpoint)),
    digestTask,
  ]);

  // 已并发算出 viewpoints/digest，即便被停止也返回已有结果（保证有总结），不覆盖为 fallback
  roundTrace?.update({
    output: { digest, viewpoints: viewpoints.map((v) => ({ agentId: v.agentId, viewpoint: v.viewpoint })), convergence },
  });
  void flushLangfuse();
  return { round, title, digest, viewpoints, convergence };
}

// ── agent 核心（speak + 多轮 function calling 循环）已重构为 LangGraph 子图 ──
// 见 src/engine/graph/AgentGraph.ts。speak() 负责组装输入、建 Langfuse trace、调用子图。

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
    logger.info('DebateEngine', 'Brainstorm 启动', { question: session.question, agentsCount: agents.length });

    // Brainstorm：各 Agent 互不引用、独立历史，可并发调用以加速
    const runOneAgent = async (agent: RosterAgent) => {
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
          }\n\n请基于你的人设，先在 <thinking> 里深度思考（至少 200 字），再用 <answer> 给出 1-2 个发散观点（不超过 600 字）。不要重复前面 Agent 的视角。`,
        },
      ];
      getMemoryForCurrentSession().set(agent.id, history);

      setAgentStatus(agent.id, 'thinking');
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: agent.id,
        type: 'system',
        payload: { text: `${persona.name} 开始分析议题…`, subText: '思考中' },
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
        logger.info('DebateEngine', 'Agent 发言完成', { phase: 'brainstorm', agentId: agent.id, agentName: persona.name, sourcesCount: result.sources.length });
      } catch (e: any) {
        logger.error('DebateEngine', 'Agent 发言失败', { phase: 'brainstorm', agentId: agent.id, agentName: persona.name, error: e?.message });
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: agent.id,
          type: 'system',
          payload: { text: `${persona.name} 发言失败：${e?.message || '未知错误'}`, subText: '错误' },
        });
      }
      setAgentStatus(agent.id, 'idle');
    };

    await Promise.all(agents.map(runOneAgent));

    if (isStopped()) return;
    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: { text: 'Brainstorm 阶段结束。点击「进入 Debate」开始对抗推演。' },
    });

    // 系统总结 Brainstorm（round 0）观点演进
    const brainstormSpeeches = useSessionStore.getState().session.speeches.filter((s) => s.round === 0);
    if (brainstormSpeeches.length) {
      try {
        const rs = await summarizeRound(0, 'Brainstorm', brainstormSpeeches, agents, cfg, []);
        useSessionStore.getState().pushRoundSummary(rs);
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: 'system',
          type: 'round-summary',
          payload: { text: rs.digest, subText: `${rs.title} · 收敛度 ${(rs.convergence * 100).toFixed(0)}%`, round: 0 },
        });
      } catch (e) {
        // 静默降级
        logger.warn('DebateEngine', 'Brainstorm 轮总结失败（降级）', { error: e instanceof Error ? e.message : String(e) });
      }
    }

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
    logger.info('DebateEngine', 'Debate 启动', { maxRounds: session.maxRounds, question: session.question });

    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: { text: `Debate 开始：共 ${session.maxRounds} 轮，每轮全员对抗推演。` },
    });

    const cfg = getLLMConfig()!;
    const debateStart = Date.now();

    for (let r = 1; r <= session.maxRounds; r++) {
      if (isStopped()) return;
      await waitIfPaused();
      const roundStart = Date.now();
      setCurrentRound(r);
      logger.info('DebateEngine', `第 ${r}/${session.maxRounds} 轮开始`);

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
          }${interruptNote}\n\n请按你的角色立场：\n- 在 <thinking> 中深度反驳或推进（至少 200 字，必须显式回应对方至少一个观点）\n- 在 <answer> 中输出 600 字内的正式发言\n- 必要时调用 web_search 检索最新数据/案例\n- 不要复读你之前的论点`,
        };
        history.push(userMsg);

        setAgentStatus(agent.id, 'thinking');
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: agent.id,
          type: 'system',
          payload: { text: `${persona.name} 第 ${r} 轮分析中…`, subText: '思考中' },
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
          logger.info('DebateEngine', 'Agent 发言完成', { round: r, agentId: agent.id, agentName: persona.name, sourcesCount: result.sources.length });
        } catch (e: any) {
          logger.error('DebateEngine', 'Agent 发言失败', { round: r, agentId: agent.id, agentName: persona.name, error: e?.message });
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
      const roundElapsed = Date.now() - roundStart;
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: 'system',
        type: 'system',
        payload: { text: `第 ${r} 轮结束（用时 ${formatDuration(roundElapsed)}）。` },
      });
      logger.info('DebateEngine', `第 ${r}/${session.maxRounds} 轮结束`, { elapsedMs: roundElapsed });
      await delay(400);

      // 系统总结本轮观点演进
      if (!isStopped()) {
        const allSpeeches = useSessionStore.getState().session.speeches;
        const roundSpeeches = allSpeeches.filter((s) => s.round === r);
        // 上一轮发言：r=1 时取 Brainstorm(round 0)，否则取 r-1
        const prevRound = allSpeeches.filter((s) => s.round === r - 1);
        if (roundSpeeches.length) {
          try {
            const rs = await summarizeRound(r, `第 ${r} 轮`, roundSpeeches, agents, cfg, prevRound);
            rs.elapsedMs = roundElapsed;
            useSessionStore.getState().pushRoundSummary(rs);
            pushEvent({
              id: uid(),
              ts: Date.now(),
              agentId: 'system',
              type: 'round-summary',
              payload: { text: rs.digest, subText: `${rs.title} · 收敛度 ${(rs.convergence * 100).toFixed(0)}% · 用时 ${formatDuration(roundElapsed)}`, round: r },
            });
          } catch (e) {
            // 静默降级，不阻断后续轮次
            logger.warn('DebateEngine', `第 ${r} 轮总结失败（降级）`, { round: r, error: e instanceof Error ? e.message : String(e) });
          }
        }
      }
    }

    const totalElapsed = Date.now() - debateStart;
    useSessionStore.getState().setTotalElapsedMs(totalElapsed);
    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: { text: `全部轮次结束（总用时 ${formatDuration(totalElapsed, 'total')}）。可点击「生成报告」汇总结论。` },
    });
    // 辩论结束，回到 idle，否则 UI 仍显示「进行中」
    setPhase('idle');
  },

  /**
   * ContinueDebate：追加 N 轮辩论，从上次结束处续接。
   * 不重置记忆，复用已有 Agent 历史 + interrupt buffer 中的公共信息。
   */
  async continueDebate(additionalRounds: number) {
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

    const { session, setPhase, setCurrentRound, setMaxRounds } = useSessionStore.getState();
    // 续接基点 = 实际已完成的最大轮次（speeches 中的最大 round），而非 maxRounds。
    // 中断后再追加必须从中断处继续：maxRounds 可能远大于实际进度（如设了 100 轮但在第 3 轮中断），
    // 若以 maxRounds 为基点会跳到第 101 轮，跳过中间未完成的轮次。
    // 同时天然防御 maxRounds 被异常改写（如清空输入框被重置为 1）：以 speeches 实际进度为准，与 maxRounds 无关。
    const maxRoundDone = session.speeches.reduce((m, s) => Math.max(m, s.round), 0);
    const newMaxRounds = maxRoundDone + additionalRounds;
    setMaxRounds(newMaxRounds);
    setPhase('debate');

    // 恢复之前积累的记忆（页面刷新时仍可续接）
    loadMemoryFromStore();

    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: { text: `追加辩论：第 ${maxRoundDone + 1} - ${newMaxRounds} 轮（共 ${additionalRounds} 轮）。` },
    });

    const cfg = getLLMConfig()!;

    for (let r = maxRoundDone + 1; r <= newMaxRounds; r++) {
      if (isStopped()) return;
      await waitIfPaused();
      setCurrentRound(r);

      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: 'system',
        type: 'system',
        payload: { text: `── 第 ${r} / ${newMaxRounds} 轮 ──` },
      });

      const agents = useRosterStore.getState().agents;
      for (let i = 0; i < agents.length; i++) {
        if (isStopped()) return;
        await waitIfPaused();
        const agent = agents[i];
        const persona = resolvePersona(agent);
        const history = getMemoryForCurrentSession().get(agent.id) || [];
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
          }${interruptNote}\n\n请基于你的人设，先在 <thinking> 里深度思考（至少 200 字），再用 <answer> 给出正式发言（不超过 600 字）。发言中必须回应前文某一 Agent 的具体观点。`,
        };
        history.push(userMsg);

        setAgentStatus(agent.id, 'thinking');
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: agent.id,
          type: 'system',
          payload: { text: `${persona.name} 第 ${r} 轮分析中…`, subText: '思考中' },
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
      logger.info('DebateEngine', `第 ${r}/${newMaxRounds} 轮结束`);
      await delay(400);

      if (!isStopped()) {
        const allSpeeches = useSessionStore.getState().session.speeches;
        const roundSpeeches = allSpeeches.filter((s) => s.round === r);
        const prevRound = allSpeeches.filter((s) => s.round === r - 1);
        if (roundSpeeches.length) {
          try {
            const rs = await summarizeRound(r, `第 ${r} 轮`, roundSpeeches, agents, cfg, prevRound);
            useSessionStore.getState().pushRoundSummary(rs);
            pushEvent({
              id: uid(),
              ts: Date.now(),
              agentId: 'system',
              type: 'round-summary',
              payload: { text: rs.digest, subText: `${rs.title} · 收敛度 ${(rs.convergence * 100).toFixed(0)}%`, round: r },
            });
          } catch {
            // 静默降级
          }
        }
      }
    }

    // 清空已消费的 interrupt buffer
    getInterruptBuffer().length = 0;

    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: { text: `追加辩论结束（第 ${newMaxRounds} 轮）。可点击「生成报告」汇总结论。` },
    });
    setPhase('idle');
  },

  pause() {
    useSessionStore.getState().setPaused(true);
  },
  resume() {
    useSessionStore.getState().setPaused(false);
  },
  async stop() {
    const session = useSessionStore.getState().session;
    logBreakpoint('DebateEngine', '用户手动停止', {
      phase: session.phase,
      round: session.currentRound,
      maxRounds: session.maxRounds,
      sessionId: session.id,
      speechesCount: session.speeches.length,
      eventsCount: session.events.length,
    });
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
 * 调用真实 LLM（通过 LangGraph 子图）。不使用 Mock 模式。
 * 预检索 / 多轮 function calling / Anthropic 原生搜索 全部在子图内完成；
 * speak 只负责组装输入、建 Langfuse trace、Anthropic 无 sources 重试策略。
 * 签名与返回值与重构前一致，三处调用点零改动。
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

    // 联网检索就绪判定（与重构前一致）
    const searchReady = cfg.enableSearch && (kind === 'anthropic' || isSearchResolverConfigured());

    // 上一轮对方最后一条发言，供子图拼检索 query
    const lastOpponentText = session.speeches
      .slice()
      .reverse()
      .find((s) => s.agentId !== agent.id && s.round === round)?.text;

    // ── Langfuse trace（可选）──
    const lf = getLangfuse();
    const trace = lf?.trace({
      name: `speech:${persona.name}`,
      sessionId: session.id,
      userId: agent.id,
      input: { question: session.question, round, stance: persona.stance },
      metadata: {
        agentId: agent.id,
        agentName: persona.name,
        stance: persona.stance,
        round,
        model: cfg.model,
        providerKind: kind,
        enableSearch: cfg.enableSearch,
        searchReady,
      },
      tags: [session.id, `round-${round}`, agent.id, persona.stance],
    });

    // ── 回调：沿用现有 pushEvent 事件流，保持 UI 行为一致 ──
    const onReasoning = (r: string) => {
      if (!r) return;
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: agent.id,
        type: 'think',
        payload: { text: r, subText: `${persona.name} 实时思考` },
      });
    };
    const onCite = (sources: Source[], evType: 'cite' | 'search' = 'cite') => {
      if (!sources.length) return;
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: agent.id,
        type: evType,
        payload: { text: '', sources },
      });
    };
    const onSearchNoKey = () => {
      // 每会话只提示一次，避免对话框被重复系统信息刷屏
      if (!searchKeyMissingNotified) {
        searchKeyMissingNotified = true;
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: 'system',
          type: 'system',
          payload: { text: '未配置搜索 Key，本轮辩论将不联网检索（可在网关配置 Tavily/Serper）' },
        });
      }
    };

    let result = await (await import('@/engine/graph/AgentGraph')).runAgentGraph({
      messages: history,
      cfg,
      agent,
      agentName: persona.name,
      stance: persona.stance,
      round,
      sessionId: session.id,
      question: session.question,
      background: session.background,
      lastOpponentText,
      abort: ctrl.signal,
      trace: trace ?? undefined,
      onReasoning,
      onCite,
      onSearchNoKey,
    });

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
      result = await (await import('@/engine/graph/AgentGraph')).runAgentGraph({
        messages: history,
        cfg,
        agent,
        agentName: persona.name,
        stance: persona.stance,
        round,
        sessionId: session.id,
        question: session.question,
        background: session.background,
        lastOpponentText,
        abort: ctrl.signal,
        trace: trace ?? undefined,
        retry: true,
        onReasoning,
        onCite,
        onSearchNoKey,
      });
    }

    trace?.update({
      output: { final: result.final.slice(0, 500), sourcesCount: result.sources.length },
      metadata: { sourcesCount: result.sources.length, retried: kind === 'anthropic' && searchReady },
    });
    void flushLangfuse();

    return { final: result.final, sources: result.sources };
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
