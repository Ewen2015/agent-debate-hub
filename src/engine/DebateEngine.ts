import { resolvePersona, MockLLM, MockSearch } from '@/engine/MockLLM';
import { useRosterStore } from '@/store/staticStores';
import { useSessionStore } from '@/store/sessionStore';
import type {
  DebateEvent,
  RosterAgent,
  Source,
  Speech,
} from '@/types';

const uid = () => Math.random().toString(36).slice(2, 11);

const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

const waitIfPaused = async () => {
  const s = useSessionStore.getState().session;
  while (useSessionStore.getState().session.paused) {
    await delay(200);
    if (useSessionStore.getState().session.phase === 'idle') return;
  }
  if (useSessionStore.getState().session.phase === 'idle') return;
};

const isStopped = () => {
  const ph = useSessionStore.getState().session.phase;
  return ph === 'idle' || ph === 'report';
};

const agentById = (id: string) =>
  useRosterStore.getState().agents.find((a) => a.id === id);

const setAgentStatus = (id: string, status: RosterAgent['status']) => {
  useRosterStore.getState().updateAgent(id, { status });
};

const interruptBuffer: string[] = [];

export const pushHumanInterrupt = (text: string) => {
  const cleaned = text.trim();
  if (!cleaned) return;
  interruptBuffer.push(cleaned);
  const { pushEvent } = useSessionStore.getState();
  const event: DebateEvent = {
    id: uid(),
    ts: Date.now(),
    agentId: 'human',
    type: 'interrupt',
    payload: { text: cleaned, subText: '人类主持人' },
  };
  pushEvent(event);
};

export const DebateEngine = {
  interruptBuffer,

  async startBrainstorm() {
    const { session, setPhase, pushEvent, clearEvents, clearSpeeches } =
      useSessionStore.getState();
    if (!session.question) return;
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

    const agents = useRosterStore.getState().agents;
    const ideas: string[] = [];
    for (const agent of agents) {
      if (isStopped()) return;
      await waitIfPaused();
      const persona = resolvePersona(agent);
      setAgentStatus(agent.id, 'thinking');

      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: agent.id,
        type: 'think',
        payload: { text: `${persona.name} 正在围绕议题展开发散……`, subText: '思考中' },
      });

      await delay(700 + Math.random() * 800);

      if (isStopped()) return;
      const text = await MockLLM.brainstorm({
        agent,
        persona,
        question: session.question,
        priorIdeas: ideas,
        interrupts: [...interruptBuffer].slice(-2),
      });

      const speech: Speech = {
        id: uid(),
        round: 0,
        agentId: agent.id,
        stance: persona.stance,
        text,
        ts: Date.now(),
      };
      useSessionStore.getState().pushSpeech(speech);
      ideas.push(text.slice(0, 60));

      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: agent.id,
        type: 'speak',
        payload: { text, subText: `${persona.name} 发言` },
      });

      setAgentStatus(agent.id, 'idle');
      await delay(400 + Math.random() * 400);
    }

    if (isStopped()) return;
    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: { text: 'Brainstorm 阶段结束。点击「进入 Debate」开始对抗推演。' },
    });
    setAgentStatus(agents[0]?.id || '', 'idle');
  },

  async enterDebate() {
    const { session, setPhase, setCurrentRound, pushEvent } =
      useSessionStore.getState();
    setPhase('debate');
    setCurrentRound(0);

    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: {
        text: `Debate 阶段开始。共 ${session.maxRounds} 轮，每轮全员发言。`,
      },
    });

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
      let lastOpponentText: string | undefined = undefined;
      for (let i = 0; i < agents.length; i++) {
        if (isStopped()) return;
        await waitIfPaused();
        const agent = agents[i];
        const persona = resolvePersona(agent);

        setAgentStatus(agent.id, 'thinking');
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: agent.id,
          type: 'think',
          payload: { text: `${persona.name} 正在组织反驳……`, subText: '思考中' },
        });
        await delay(500 + Math.random() * 700);

        let sources: Source[] | undefined;
        if (Math.random() < 0.55) {
          setAgentStatus(agent.id, 'searching');
          pushEvent({
            id: uid(),
            ts: Date.now(),
            agentId: agent.id,
            type: 'search',
            payload: { text: `${persona.name} 启动网络检索补强论点……`, subText: '检索中' },
          });
          sources = await MockSearch.search(session.question, persona.stance, 2);
          pushEvent({
            id: uid(),
            ts: Date.now(),
            agentId: agent.id,
            type: 'cite',
            payload: {
              text: `引用 ${sources.length} 条资料`,
              sources,
              subText: '引用证据',
            },
          });
        }

        if (isStopped()) return;
        setAgentStatus(agent.id, 'speaking');
        const isOpening = i === 0;
        const text = await MockLLM.debate({
          agent,
          persona,
          question: session.question,
          round: r,
          isOpening,
          latestOpponentText: lastOpponentText,
          interrupts: [...interruptBuffer].slice(-2),
          sources,
        });

        const speech: Speech = {
          id: uid(),
          round: r,
          agentId: agent.id,
          stance: persona.stance,
          text,
          sources,
          ts: Date.now(),
        };
        useSessionStore.getState().pushSpeech(speech);
        pushEvent({
          id: uid(),
          ts: Date.now(),
          agentId: agent.id,
          type: 'speak',
          payload: { text, subText: `${persona.name} 发言`, sources },
        });

        lastOpponentText = text;
        setAgentStatus(agent.id, 'idle');
        await delay(300 + Math.random() * 500);
      }

      if (isStopped()) return;
      pushEvent({
        id: uid(),
        ts: Date.now(),
        agentId: 'system',
        type: 'system',
        payload: { text: `第 ${r} 轮结束。` },
      });
      await delay(600);
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
    const { setPaused, setPhase, pushEvent } = useSessionStore.getState();
    setPaused(false);
    setPhase('idle');
    pushEvent({
      id: uid(),
      ts: Date.now(),
      agentId: 'system',
      type: 'system',
      payload: { text: '会话被中止。' },
    });
    const agents = useRosterStore.getState().agents;
    for (const a of agents) setAgentStatus(a.id, 'idle');
  },
};
