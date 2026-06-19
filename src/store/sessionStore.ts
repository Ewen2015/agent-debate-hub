import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgentMemory, DebateEvent, FinalReport, Phase, Session, Speech } from '@/types';

interface SessionState {
  session: Session;
  agentMemory: AgentMemory;
  setQuestion: (q: string, bg?: string) => void;
  setPhase: (p: Phase) => void;
  setPaused: (v: boolean) => void;
  setMaxRounds: (n: number) => void;
  setCurrentRound: (n: number) => void;
  pushEvent: (e: DebateEvent) => void;
  pushSpeech: (s: Speech) => void;
  clearEvents: () => void;
  clearSpeeches: () => void;
  reset: () => void;
  setReport: (r: FinalReport | null) => void;
  report: FinalReport | null;
  /** 更新单个 Agent 的记忆 */
  setAgentMemory: (agentId: string, messages: { role: string; content: string }[]) => void;
  /** 清空所有 Agent 记忆 */
  clearAgentMemory: () => void;
}

const emptySession = (): Session => ({
  id: Math.random().toString(36).slice(2, 10),
  question: '',
  background: '',
  phase: 'idle',
  events: [],
  speeches: [],
  currentRound: 0,
  maxRounds: 3,
  startedAt: 0,
  paused: false,
});

const MAX_EVENTS = 500;

const trim = <T,>(arr: T[], max: number) =>
  arr.length > max ? arr.slice(arr.length - max) : arr;

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      session: emptySession(),
      agentMemory: {},
      report: null,
      setQuestion: (q, bg) =>
        set((s) => ({
          session: { ...s.session, question: q, background: bg || '' },
        })),
      setPhase: (p) =>
        set((s) => ({
          session: {
            ...s.session,
            phase: p,
            startedAt: p === 'brainstorm' ? Date.now() : s.session.startedAt,
          },
        })),
      setPaused: (v) => set((s) => ({ session: { ...s.session, paused: v } })),
      setMaxRounds: (n) =>
        set((s) => ({ session: { ...s.session, maxRounds: n } })),
      setCurrentRound: (n) =>
        set((s) => ({ session: { ...s.session, currentRound: n } })),
      pushEvent: (e) =>
        set((s) => ({
          session: { ...s.session, events: trim([...s.session.events, e], MAX_EVENTS) },
        })),
      pushSpeech: (sp) =>
        set((s) => ({
          session: { ...s.session, speeches: [...s.session.speeches, sp] },
        })),
      clearEvents: () => set((s) => ({ session: { ...s.session, events: [] } })),
      clearSpeeches: () => set((s) => ({ session: { ...s.session, speeches: [] } })),
      reset: () => set({ session: emptySession(), report: null, agentMemory: {} }),
      setReport: (r) => set({ report: r }),
      setAgentMemory: (agentId, messages) =>
        set((s) => ({
          agentMemory: {
            ...s.agentMemory,
            [agentId]: messages.map((m) => ({
              role: m.role as 'system' | 'user' | 'assistant',
              content: m.content,
            })),
          },
        })),
      clearAgentMemory: () => set({ agentMemory: {} }),
    }),
    {
      name: 'gd-hub:session:v1',
      partialize: (s) => ({
        session: s.session,
        report: s.report,
        agentMemory: s.agentMemory,
      }),
    },
  ),
);
