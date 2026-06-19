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

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="group flex gap-3 px-4 py-3 hover:bg-[var(--bg-card)]/80 transition-colors"
    >
      <Avatar agentId={speech.agentId} agents={agents} />
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-display text-sm text-[var(--text-primary)]">
            {persona?.name || '系统'}
          </span>
          <span className="font-mono text-[11px] text-[var(--text-muted)]">{formatTime(speech.ts)}</span>
          <Chip tone={stance.tone}>{stance.label}</Chip>
          <Chip tone={speech.round > 0 ? 'mute' : 'violet'}>
            {speech.round > 0 ? `R${speech.round}` : 'Brainstorm'}
          </Chip>
        </header>

        <div
          className="mt-1.5 border-l-2 pl-3 text-[14px] leading-relaxed text-[var(--text-soft)] whitespace-pre-wrap"
          style={{ borderColor: stance.color }}
        >
          {speech.text}
        </div>

        {speech.sources && speech.sources.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setSourcesOpen((open) => !open)}
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widish text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
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
                  className="overflow-hidden"
                >
                  <SourceList sources={speech.sources} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
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

  if (isHostMessage) {
    return (
      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="group flex gap-3 px-4 py-3 hover:bg-[var(--bg-card)]/80 transition-colors"
      >
        <Avatar agentId={event.agentId} agents={agents} />
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center gap-2">
            <span className="font-display text-sm text-[var(--text-primary)]">
              {displayName(agents, event.agentId)}
            </span>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">{formatTime(event.ts)}</span>
            <Chip tone={meta.tone}>{meta.label}</Chip>
          </header>
          <div className="mt-1.5 text-[14px] leading-relaxed text-[var(--text-soft)] whitespace-pre-wrap">
            {text}
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
      className="group flex gap-3 px-4 py-2.5 hover:bg-[var(--bg-card)]/70 transition-colors"
    >
      <Avatar agentId={event.agentId} agents={agents} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[12px] leading-relaxed">
          <Chip tone={meta.tone} className="rounded-md">
            {meta.icon}
            {meta.label}
          </Chip>
          <span className="font-display text-[var(--text-primary)]/90">
            {displayName(agents, event.agentId)}
          </span>
          <span className="font-mono text-[11px] text-[var(--text-muted)]">{formatTime(event.ts)}</span>
          {event.payload.subText && (
            <span className="text-[var(--text-muted)]">· {event.payload.subText}</span>
          )}
        </div>

        {text && (
          <div
            className={`mt-1.5 text-[12.5px] leading-relaxed ${
              event.type === 'think'
                ? 'font-mono italic text-[var(--accent-gold)]/82'
                : event.type === 'search' || event.type === 'cite'
                ? 'text-[var(--accent-cyan)]/88'
                : 'text-[var(--text-muted)]'
            } ${!expanded && isLong ? 'line-clamp-2' : 'whitespace-pre-wrap'}`}
          >
            {text}
          </div>
        )}

        {event.payload.sources && event.payload.sources.length > 0 && (
          <SourceList sources={event.payload.sources} />
        )}

        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-widish text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {expanded ? '折叠' : '展开'}
          </button>
        )}
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
    <section className="glass-strong rounded-lg min-h-[620px] lg:min-h-[680px] flex flex-col overflow-hidden">
      <header className="border-b border-[var(--border-soft)] bg-[var(--bg-elev)]/72 px-4 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-[var(--bg-card-strong)] text-[var(--accent-gold)]">
            <Hash size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-lg leading-tight text-[var(--text-primary)]">
                {channelName}
              </h1>
              <Chip tone={isLive ? 'cyan' : 'mute'}>{phaseLabel}</Chip>
              <Chip tone="mute">{timeline.length} 条消息</Chip>
            </div>
            <div className="mt-1 truncate text-[12px] text-[var(--text-muted)]">
              {session.question.trim() || 'Untitled discussion'}
            </div>
          </div>
        </div>
      </header>

      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto scroll-shadow">
        {timeline.length === 0 ? (
          <div className="flex h-full min-h-[360px] items-center justify-center px-6 text-center">
            <div>
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-md bg-[var(--bg-card-strong)] text-[var(--accent-gold)]">
                <Hash size={20} />
              </div>
              <div className="font-display text-base text-[var(--text-primary)]">频道等待第一条消息</div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">#{channelName}</div>
            </div>
          </div>
        ) : (
          <div className="py-2">
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

      <footer className="border-t border-[var(--border-soft)] bg-[var(--bg-elev)]/78 p-3">
        <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-soft)]/75 focus-within:border-[var(--accent-violet)]/45 transition-colors">
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
            className="max-h-32 min-h-[48px] w-full resize-none bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-primary)]/32"
          />
          <div className="flex items-center justify-between gap-2 border-t border-[var(--border-soft)] px-2 py-2">
            <div className="text-[11px] text-[var(--text-muted)]">
              {isLive ? (isPaused ? 'Paused' : 'Live channel') : 'Offline channel'}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim() || !isLive || isPaused}
              title="发送介入"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-violet)] text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </footer>
    </section>
  );
}
