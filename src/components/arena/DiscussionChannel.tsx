import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpenCheck,
  Brain,
  ChevronDown,
  ChevronUp,
  Hash,
  MessageSquare,
  Quote,
  Search,
  Send,
  Sparkles,
} from 'lucide-react';
import { pushHumanInterrupt } from '@/engine/DebateEngine';
import { resolvePersona } from '@/engine/MockLLM';
import { useRosterStore } from '@/store/staticStores';
import { useSessionStore } from '@/store/sessionStore';
import { Chip } from '@/components/shared/Chip';
import type { AgentStance, DebateEvent, RosterAgent, Source, Speech } from '@/types';

type Tone = 'gold' | 'cyan' | 'rose' | 'violet' | 'neutral' | 'mute';

type TimelineItem =
  | { id: string; ts: number; kind: 'speech'; speech: Speech }
  | { id: string; ts: number; kind: 'event'; event: DebateEvent };

const LONG_TEXT = 180;

const STANCE_META: Record<AgentStance, { label: string; tone: Tone; color: string }> = {
  pro: { label: '支持', tone: 'gold', color: '#E8B14C' },
  con: { label: '反对', tone: 'rose', color: '#F47174' },
  neutral: { label: '中立', tone: 'cyan', color: '#5FE0C7' },
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const channelNameFromQuestion = (question: string) => {
  const clean = question
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return clean ? clean.slice(0, 22) : 'new-discussion';
};

const eventMeta = (type: DebateEvent['type']): { icon: ReactNode; label: string; tone: Tone } => {
  switch (type) {
    case 'think':
      return { icon: <Brain size={13} />, label: '思考', tone: 'gold' };
    case 'search':
      return { icon: <Search size={13} />, label: '检索', tone: 'cyan' };
    case 'cite':
      return { icon: <BookOpenCheck size={13} />, label: '引用', tone: 'cyan' };
    case 'interrupt':
      return { icon: <AlertTriangle size={13} />, label: '主持人', tone: 'rose' };
    case 'speak':
      return { icon: <MessageSquare size={13} />, label: '发言', tone: 'violet' };
    case 'system':
      return { icon: <Sparkles size={13} />, label: '系统', tone: 'mute' };
  }
};

function findAgent(agents: RosterAgent[], id: string) {
  return agents.find((agent) => agent.id === id);
}

function displayName(agents: RosterAgent[], id: string) {
  if (id === 'human') return '人类主持人';
  if (id === 'system') return '系统';
  const agent = findAgent(agents, id);
  return agent ? resolvePersona(agent).name : '未知成员';
}

function Avatar({ agentId, agents, size = 36 }: { agentId: string; agents: RosterAgent[]; size?: number }) {
  const agent = findAgent(agents, agentId);

  if (agent) {
    const persona = resolvePersona(agent);
    return (
      <div
        className="flex-shrink-0 rounded-md flex items-center justify-center font-display text-white"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${persona.gradient[0]}, ${persona.gradient[1]})`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
        }}
      >
        <span style={{ fontSize: size * 0.44 }}>{persona.emoji}</span>
      </div>
    );
  }

  const isHuman = agentId === 'human';
  return (
    <div
      className={`flex-shrink-0 rounded-md flex items-center justify-center font-display text-xs ${
        isHuman
          ? 'bg-[var(--accent-rose)]/18 text-[var(--accent-rose)]'
          : 'bg-[var(--bg-card-strong)] text-[var(--text-muted)]'
      }`}
      style={{ width: size, height: size }}
    >
      {isHuman ? 'H' : 'S'}
    </div>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {sources.map((source) => (
        <li
          key={source.url}
          className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2"
        >
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-[var(--accent-cyan)] hover:text-[var(--text-primary)] transition-colors"
          >
            {source.title}
          </a>
          <span className="ml-2 text-[10px] uppercase tracking-widish text-[var(--text-muted)]">
            {source.domain}
          </span>
          {source.snippet && (
            <div className="mt-1 text-[11.5px] leading-snug text-[var(--text-muted)]">
              {source.snippet}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function SpeechMessage({
  speech,
  agents,
  isLast,
}: {
  speech: Speech;
  agents: RosterAgent[];
  isLast: boolean;
}) {
  const agent = findAgent(agents, speech.agentId);
  const persona = agent ? resolvePersona(agent) : null;
  const stance = STANCE_META[speech.stance];
  const [sourcesOpen, setSourcesOpen] = useState(isLast);
  const isBrainstorm = speech.round === 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="group flex gap-2 px-3 py-1"
    >
      <Avatar agentId={speech.agentId} agents={agents} size={34} />
      <div className="min-w-0 flex-1">
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)]/90 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[12px] text-[var(--text-primary)]">
              {persona?.name || '系统'}
            </span>
            <span className="font-mono text-[9px] text-[var(--text-muted)]">{formatTime(speech.ts)}</span>
            <Chip tone={stance.tone} size="sm">
              {stance.label}
            </Chip>
            <Chip tone={isBrainstorm ? 'violet' : 'mute'} size="sm">
              {isBrainstorm ? 'Brainstorm' : `R${speech.round}`}
            </Chip>
          </div>

          <div className="mt-1.5 text-[12px] leading-5 text-[var(--text-primary)] whitespace-pre-wrap">
            {speech.text}
          </div>

          {speech.sources && speech.sources.length > 0 && (
            <div className="mt-2 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-soft)] p-2">
              <button
                type="button"
                onClick={() => setSourcesOpen((open) => !open)}
                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widish text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Quote size={12} />
                证据 {speech.sources.length}
                {sourcesOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              <AnimatePresence initial={false}>
                {sourcesOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mt-2"
                  >
                    <SourceList sources={speech.sources} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function EventMessage({ event, agents }: { event: DebateEvent; agents: RosterAgent[] }) {
  const meta = eventMeta(event.type);
  const text = event.payload.text || event.payload.subText || '';
  const isLong = text.length > LONG_TEXT;
  const [expanded, setExpanded] = useState(!isLong);
  const isHostMessage = event.type === 'interrupt';
  const isSystemMessage = event.type === 'system' || event.agentId === 'system';

  if (isSystemMessage) {
    return (
      <motion.article
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="group px-3 py-1"
      >
        <div className="min-w-0 text-[11.5px] leading-6 text-[var(--text-muted)]">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <span className="font-medium">系统</span>
            <span className="font-mono">{formatTime(event.ts)}</span>
          </div>
          {text && <div className="mt-1 whitespace-pre-wrap">{text}</div>}
        </div>
      </motion.article>
    );
  }

  if (isHostMessage) {
    return (
      <motion.article
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="group flex gap-2 px-3 py-1"
      >
        <Avatar agentId={event.agentId} agents={agents} size={28} />
        <div className="min-w-0 flex-1">
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-soft)] p-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <Chip tone={meta.tone} className="rounded-full" size="sm">
                {meta.icon}
                {meta.label}
              </Chip>
              <span>{displayName(agents, event.agentId)}</span>
              <span className="font-mono">{formatTime(event.ts)}</span>
            </div>
            <div className="mt-1 text-[11.5px] leading-5 text-[var(--text-primary)] whitespace-pre-wrap">
              {text}
            </div>
          </div>
        </div>
      </motion.article>
    );
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="group flex gap-2 px-3 py-1"
    >
      <Avatar agentId={event.agentId} agents={agents} size={28} />
      <div className="min-w-0 flex-1">
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-soft)] p-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <Chip tone={meta.tone} className="rounded-full" size="sm">
              {meta.icon}
              {meta.label}
            </Chip>
            <span>{displayName(agents, event.agentId)}</span>
            <span className="font-mono">{formatTime(event.ts)}</span>
            {event.payload.subText && <span>· {event.payload.subText}</span>}
          </div>

          {text && (
            <div
              className={`mt-1 text-[11.5px] leading-5 ${
                event.type === 'think'
                  ? 'font-mono text-[var(--accent-gold)]/82'
                  : event.type === 'search' || event.type === 'cite'
                  ? 'text-[var(--accent-cyan)]/88'
                  : 'text-[var(--text-muted)]'
              } ${!expanded && isLong ? 'line-clamp-2' : 'whitespace-pre-wrap'}`}
            >
              {text}
            </div>
          )}

          {event.payload.sources && event.payload.sources.length > 0 && (
            <div className="mt-2">
              <SourceList sources={event.payload.sources} />
            </div>
          )}

          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-widish text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {expanded ? '折叠' : '展开'}
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}

export function DiscussionChannel() {
  const session = useSessionStore((s) => s.session);
  const agents = useRosterStore((s) => s.agents);
  const [draft, setDraft] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const channelName = channelNameFromQuestion(session.question);
  const isLive = session.phase === 'brainstorm' || session.phase === 'debate';
  const isPaused = isLive && session.paused;
  const phaseLabel =
    session.phase === 'brainstorm'
      ? 'Brainstorm'
      : session.phase === 'debate'
      ? `Debate R${session.currentRound}/${session.maxRounds}`
      : session.phase === 'report'
      ? 'Report'
      : 'Idle';

  const timeline = useMemo<TimelineItem[]>(() => {
    const events = session.events
      .filter((event) => event.type !== 'speak')
      .map((event) => ({ id: `event-${event.id}`, ts: event.ts, kind: 'event' as const, event }));
    const speeches = session.speeches.map((speech) => ({
      id: `speech-${speech.id}`,
      ts: speech.ts,
      kind: 'speech' as const,
      speech,
    }));

    return [...events, ...speeches].sort((a, b) => {
      if (a.ts !== b.ts) return a.ts - b.ts;
      if (a.kind === b.kind) return a.id.localeCompare(b.id);
      return a.kind === 'event' ? -1 : 1;
    });
  }, [session.events, session.speeches]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [timeline.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text || !isLive || isPaused) return;
    pushHumanInterrupt(text);
    setDraft('');
  };

  return (
    <section className="glass-strong rounded-2xl flex flex-col h-full min-h-0 overflow-hidden">
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto bg-[var(--bg-soft)]/80 px-1 py-1.5 scroll-shadow">
        {timeline.length === 0 ? (
          <div className="flex h-full min-h-[320px] items-center justify-center px-4 text-center">
            <div>
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-card-strong)] text-[var(--accent-gold)]">
                <Hash size={22} />
              </div>
              <div className="font-display text-[12px] text-[var(--text-primary)]">频道等待第一条消息</div>
              <div className="mt-1 text-[10px] text-[var(--text-muted)]">#{channelName}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-2 px-2">
            <AnimatePresence initial={false}>
              {timeline.map((item, index) =>
                item.kind === 'speech' ? (
                  <SpeechMessage
                    key={item.id}
                    speech={item.speech}
                    agents={agents}
                    isLast={index === timeline.length - 1}
                  />
                ) : (
                  <EventMessage key={item.id} event={item.event} agents={agents} />
                ),
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <footer className="border-t border-[var(--border-soft)] bg-[var(--bg-elev)]/92 px-2.5 py-2">
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-soft)] px-3 py-2 shadow-sm">
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                disabled={!isLive || isPaused}
                rows={2}
                placeholder={
                  isPaused
                    ? '频道已暂停'
                    : isLive
                    ? `向 #${channelName} 发送主持人介入`
                    : '开始讨论后可发送主持人介入'
                }
                className="min-h-[54px] w-full max-w-[calc(100%-110px)] resize-none rounded-2xl border border-[var(--border-soft)] bg-transparent px-3 py-2 text-[12px] leading-5 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]/60 transition-colors"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim() || !isLive || isPaused}
                title="发送介入"
                className="inline-flex h-10 items-center rounded-2xl bg-[var(--accent-violet)] px-3 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={14} className="mr-1" />
                发送
              </button>
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">
              Enter 发送，Shift+Enter 换行。
            </div>
          </div>
        </div>
      </footer>
    </section>
  );
}
