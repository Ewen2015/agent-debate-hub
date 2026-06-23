import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpenCheck,
  Brain,
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
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
import { Markdown } from '@/components/shared/Markdown';
import type { AgentStance, DebateEvent, RosterAgent, RoundViewpoint, Source, Speech } from '@/types';

type Tone = 'gold' | 'cyan' | 'rose' | 'violet' | 'neutral' | 'mute';

type TimelineItem =
  | { id: string; ts: number; kind: 'speech'; speech: Speech }
  | { id: string; ts: number; kind: 'event'; event: DebateEvent }
  | { id: string; ts: number; kind: 'eventBundle'; events: DebateEvent[] };

const LONG_TEXT = 180;

const STANCE_META: Record<AgentStance, { label: string; tone: Tone; color: string }> = {
  pro: { label: '支持', tone: 'gold', color: '#B8A878' },
  con: { label: '反对', tone: 'rose', color: '#D08877' },
  neutral: { label: '中立', tone: 'cyan', color: '#6FB3A8' },
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
    case 'round-summary':
      return { icon: <GitCompareArrows size={13} />, label: '观点总结', tone: 'gold' };
    case 'speak':
      return { icon: <MessageSquare size={13} />, label: '发言', tone: 'violet' };
    case 'system':
      return { icon: <Sparkles size={13} />, label: '系统', tone: 'mute' };
  }
};

const isMergeableThoughtEvent = (e: DebateEvent) =>
  e.type === 'think' || e.type === 'search' || e.type === 'cite';

function mergeThoughtEvents(items: TimelineItem[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  const within = (a: number, b: number) => Math.abs(a - b) <= 15000;

  for (const item of items) {
    if (item.kind !== 'event' || !isMergeableThoughtEvent(item.event)) {
      out.push(item);
      continue;
    }

    const last = out[out.length - 1];
    if (
      last?.kind === 'eventBundle' &&
      last.events[0]?.agentId === item.event.agentId &&
      within(last.events[last.events.length - 1]?.ts ?? last.ts, item.event.ts)
    ) {
      last.events.push(item.event);
      continue;
    }

    out.push({
      id: `bundle-${item.event.id}`,
      ts: item.event.ts,
      kind: 'eventBundle',
      events: [item.event],
    });
  }

  return out;
}

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
        className="flex-shrink-0 rounded-lg flex items-center justify-center font-display text-white"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${persona.gradient[0]}, ${persona.gradient[1]})`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px -3px ' + persona.gradient[0],
        }}
      >
        <span style={{ fontSize: size * 0.44 }}>{persona.emoji}</span>
      </div>
    );
  }

  // 主持人 / 系统统一用「渐变方块 + emoji」，与 Agent 头像保持一致
  const isHuman = agentId === 'human';
  const gradient = isHuman
    ? 'linear-gradient(135deg, #9F4A3C, #C77B5E)'
    : 'linear-gradient(135deg, #4A4A52, #6B6B74)';
  const glow = isHuman ? '#9F4A3C' : '#4A4A52';
  const emoji = isHuman ? '🎙️' : '✦';
  return (
    <div
      className="flex-shrink-0 rounded-lg flex items-center justify-center text-white"
      style={{
        width: size,
        height: size,
        background: gradient,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 8px -3px ' + glow,
      }}
    >
      <span style={{ fontSize: size * 0.42 }}>{emoji}</span>
    </div>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {sources.map((source) => (
        <li
          key={source.url}
          className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2 hover:border-[var(--accent-cyan)]/30 transition-colors"
        >
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-[var(--accent-cyan)] hover:text-[var(--text-primary)] transition-colors"
          >
            {source.title}
          </a>
          <span className="ml-2 text-[10px] uppercase tracking-widest2 text-[var(--text-muted)] font-mono">
            {source.domain}
          </span>
          {source.snippet && (
            <div className="mt-1 text-[12px] leading-[20px] text-[var(--text-muted)]">
              {source.snippet}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function References({ sources }: { sources: Source[] }) {
  return (
    <div className="mt-2 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-elev)]/70 p-2.5">
      <div className="text-[10px] uppercase tracking-widest2 text-[var(--text-muted)] mb-2">
        References
      </div>
      <ol className="space-y-1.5 list-decimal pl-4">
        {sources.map((s, idx) => (
          <li key={s.url} className="text-[12px] leading-[18px] text-[var(--text-secondary)]">
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent-cyan)] hover:text-[var(--text-primary)] transition-colors"
            >
              {s.title}
            </a>
            <span className="ml-2 text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest2">
              {s.domain}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Footnotes({ sources }: { sources: Source[] }) {
  return (
    <span className="inline-flex items-center gap-1.5 ml-1">
      {sources.map((s, i) => (
        <a
          key={s.url}
          href={s.url}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent-cyan)] hover:text-[var(--text-primary)] transition-colors"
          title={s.title}
        >
          <sup className="text-[10px] font-mono">{i + 1}</sup>
        </a>
      ))}
    </span>
  );
}

function ThoughtBundleMessage({ events, agents }: { events: DebateEvent[]; agents: RosterAgent[] }) {
  const agentId = events[0]?.agentId ?? 'system';
  const agent = findAgent(agents, agentId);
  const persona = agent ? resolvePersona(agent) : null;
  const firstTs = events[0]?.ts ?? Date.now();
  const lastTs = events[events.length - 1]?.ts ?? firstTs;

  const thinking = events
    .filter((e) => e.type === 'think' && e.payload.text)
    .map((e) => e.payload.text!)
    .join('\n');

  const searchText = events
    .filter((e) => (e.type === 'search' || e.type === 'cite') && e.payload.text)
    .map((e) => e.payload.text!)
    .join('\n');

  const sources = (() => {
    const seen = new Set<string>();
    const out: Source[] = [];
    for (const e of events) {
      for (const s of e.payload.sources || []) {
        if (!s?.url || seen.has(s.url)) continue;
        seen.add(s.url);
        out.push(s);
      }
    }
    return out;
  })();

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="group flex gap-2.5 px-3 py-1.5"
    >
      <Avatar agentId={agentId} agents={agents} size={30} />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-soft)] p-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <span className="font-display text-[12px] text-[var(--text-primary)]">
              {persona?.name || displayName(agents, agentId)}
            </span>
            <span className="font-mono">
              {formatTime(firstTs)}
              {lastTs !== firstTs ? `–${formatTime(lastTs)}` : ''}
            </span>
            <span className="text-[10px] uppercase tracking-widest2 text-[var(--text-muted)]">
              思考
              {sources.length ? ' · 检索' : ''}
            </span>
          </div>

          {thinking && (
            <div className="mt-1.5 text-[12px] leading-[20px] text-[var(--text-secondary)]">
              <Markdown>{thinking}</Markdown>
            </div>
          )}

          {searchText && (
            <div className="mt-2 text-[12px] leading-[20px] text-[var(--text-secondary)]">
              <Markdown>{searchText}</Markdown>
              {sources.length > 0 && (
                <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                  来源
                  <Footnotes sources={sources} />
                </div>
              )}
            </div>
          )}

          {sources.length > 0 && <References sources={sources} />}
        </div>
      </div>
    </motion.article>
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
      className="group flex gap-2.5 px-3 py-1.5"
    >
      <Avatar agentId={speech.agentId} agents={agents} size={36} />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-card)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[13px] tracking-tightish text-[var(--text-primary)]">
              {persona?.name || '系统'}
            </span>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">{formatTime(speech.ts)}</span>
            <Chip tone={stance.tone} size="sm">
              {stance.label}
            </Chip>
            <Chip tone={isBrainstorm ? 'violet' : 'mute'} size="sm">
              {isBrainstorm ? 'Brainstorm' : `R${speech.round}`}
            </Chip>
          </div>

          <div className="mt-2 text-[12px] leading-[20px] text-[var(--text-primary)]">
            <Markdown>{speech.text}</Markdown>
          </div>

          {speech.sources && speech.sources.length > 0 && (
            <div className="mt-2.5 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-soft)] p-2.5">
              <button
                type="button"
                onClick={() => setSourcesOpen((open) => !open)}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
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
  const roundSummaries = useSessionStore((s) => s.session.roundSummaries);
  const speeches = useSessionStore((s) => s.session.speeches);

  // 每轮观点总结：digest + 各 Agent 一句话观点（可展开看完整发言）
  if (event.type === 'round-summary') {
    const round = event.payload.round;
    const rs = roundSummaries.find((x) => x.round === round);
    const title = rs?.title || (event.payload.subText ? event.payload.subText.split(' · ')[0] : '本轮总结');
    const viewpoints = rs?.viewpoints ?? [];
    const convergence = rs?.convergence;
    return (
      <RoundSummaryCard
        title={title}
        digest={event.payload.text || rs?.digest || ''}
        convergence={convergence}
        viewpoints={viewpoints}
        round={round ?? 0}
        speeches={speeches}
        ts={event.ts}
      />
    );
  }

  if (isSystemMessage) {
    return (
      <motion.article
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="group px-3 py-1"
      >
        <div className="min-w-0 text-[12px] leading-[20px] text-[var(--text-muted)]">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <span className="font-medium">系统</span>
            <span className="font-mono">{formatTime(event.ts)}</span>
          </div>
          {text && (
            <div className="mt-1 text-[12px] leading-[20px] text-[var(--text-secondary)]">
              <Markdown>{text}</Markdown>
            </div>
          )}
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
        className="group flex gap-2.5 px-3 py-1.5"
      >
        <Avatar agentId={event.agentId} agents={agents} size={36} />
        <div className="min-w-0 flex-1">
          <div
            className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-card)] p-3"
            style={{ borderLeft: '3px solid var(--accent-rose)' }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[13px] tracking-tightish text-[var(--text-primary)]">
                {displayName(agents, event.agentId)}
              </span>
              <span className="font-mono text-[10px] text-[var(--text-muted)]">
                {formatTime(event.ts)}
              </span>
              <Chip tone="rose" size="sm">
                <AlertTriangle size={12} />
                主持人
              </Chip>
            </div>
            <div className="mt-2 text-[12px] leading-[20px] text-[var(--text-primary)]">
              <Markdown>{text}</Markdown>
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
      className="group flex gap-2.5 px-3 py-1.5"
    >
      <Avatar agentId={event.agentId} agents={agents} size={30} />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-soft)] p-3">
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
            <Markdown
              className={`mt-1.5 text-[12px] leading-[20px] ${
                event.type === 'think'
                  ? 'font-mono text-[var(--accent-gold)]/85'
                  : event.type === 'search' || event.type === 'cite'
                  ? 'text-[var(--accent-cyan)]/85'
                  : 'text-[var(--text-muted)]'
              } ${!expanded && isLong ? 'line-clamp-2' : ''}`}
            >
              {text}
            </Markdown>
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
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
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

/** 每轮观点总结卡片：digest + 收敛度 + 各 Agent 观点（可展开看完整发言）。 */
function RoundSummaryCard({
  title,
  digest,
  convergence,
  viewpoints,
  round,
  speeches,
  ts,
}: {
  title: string;
  digest: string;
  convergence?: number;
  viewpoints: RoundViewpoint[];
  round: number;
  speeches: Speech[];
  ts: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  // 取该轮每位 Agent 的完整原始发言，供展开兜底
  const fullTextOf = (agentId: string) =>
    speeches.find((s) => s.round === round && s.agentId === agentId)?.text || '';

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="group mx-1 my-1.5 rounded-lg border border-[var(--accent-gold)]/25 bg-[var(--accent-gold)]/6 px-3 py-2"
    >
      {/* 标题行 */}
      <div className="flex items-center gap-2 text-[11px] text-[var(--accent-gold)]/80">
        <GitCompareArrows size={13} className="shrink-0" />
        <span className="font-medium">{title} · 观点总结</span>
        <span className="font-mono text-[var(--text-muted)] ml-auto shrink-0">{formatTime(ts)}</span>
      </div>

      {/* 收敛度行（独立一行，避免窄屏挤压） */}
      {typeof convergence === 'number' && (
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
          <span>收敛度</span>
          <span className="relative inline-block w-24 h-1.5 rounded-full bg-[var(--bg-card-strong)] overflow-hidden align-middle">
            <span
              className="absolute left-0 top-0 h-full rounded-full bg-[var(--accent-gold)]"
              style={{ width: `${Math.round(convergence * 100)}%` }}
            />
          </span>
          <span className="font-mono text-[var(--accent-gold)]">{(convergence * 100).toFixed(0)}%</span>
        </div>
      )}

      {/* 本轮总结 digest */}
      {digest && (
        <div className="mt-1.5 text-[12.5px] leading-[20px] text-[var(--text-primary)]/90 break-words">
          <Markdown>{digest}</Markdown>
        </div>
      )}

      {/* 各 Agent 观点：竖排，名字在上、观点在下，可展开看完整发言 */}
      {viewpoints.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {viewpoints.map((v) => {
            const isExpanded = expanded === v.agentId;
            const full = fullTextOf(v.agentId);
            const isFallback = v.viewpoint.includes('未能提炼');
            const canExpand = Boolean(full) && (v.viewpoint.endsWith('…') || isFallback);
            return (
              <div
                key={v.agentId + v.name}
                className="rounded-md bg-[var(--bg-card-soft)]/60 border border-[var(--border-soft)] px-2 py-1.5"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-sm shrink-0"
                    style={{ background: STANCE_META[v.stance].color }}
                  />
                  <span className="text-[11px] font-medium text-[var(--text-primary)]/70 truncate">
                    {v.name}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                    {STANCE_META[v.stance].label}
                  </span>
                  {v.evidenceCount > 0 && (
                    <span className="text-[10px] text-[var(--accent-cyan)]/70 shrink-0">
                      · {v.evidenceCount} 证据
                    </span>
                  )}
                </div>
                <div className="text-[12.5px] leading-[19px] text-[var(--text-primary)]/85 break-words">
                  {isExpanded && canExpand ? full : v.viewpoint}
                </div>
                {canExpand && (
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : v.agentId)}
                    className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-[var(--accent-gold)]/80 hover:text-[var(--accent-gold)] transition-colors"
                  >
                    {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    {isExpanded ? '收起' : isFallback ? '查看原发言' : '展开全文'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
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
  // 辩论结束后仍允许输入公共信息（有发言记录且处于 idle）
  const hasDebateHistory = session.speeches.length > 0;
  const canInput = isLive || (session.phase === 'idle' && hasDebateHistory);
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

    const sorted = [...events, ...speeches].sort((a, b) => {
      if (a.ts !== b.ts) return a.ts - b.ts;
      if (a.kind === b.kind) return a.id.localeCompare(b.id);
      return a.kind === 'event' ? -1 : 1;
    });
    return mergeThoughtEvents(sorted);
  }, [session.events, session.speeches]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [timeline.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text || !canInput || isPaused) return;
    pushHumanInterrupt(text);
    setDraft('');
  };

  return (
    <section className="glass-strong rounded-2xl flex flex-col h-full min-h-0 overflow-hidden">
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto bg-[var(--bg-soft)]/60 px-1 py-2 scroll-shadow">
        {timeline.length === 0 ? (
          <div className="flex h-full min-h-[320px] items-center justify-center px-4 text-center">
            <div>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-card-strong)] text-[var(--accent-gold)]">
                <Hash size={24} />
              </div>
              <div className="font-display text-[14px] tracking-tightish text-[var(--text-primary)]">频道等待第一条消息</div>
              <div className="mt-1 text-[11px] text-[var(--text-muted)] font-mono">#{channelName}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 px-2">
            <AnimatePresence initial={false}>
              {timeline.map((item, index) =>
                item.kind === 'speech' ? (
                  <SpeechMessage
                    key={item.id}
                    speech={item.speech}
                    agents={agents}
                    isLast={index === timeline.length - 1}
                  />
                ) : item.kind === 'eventBundle' ? (
                  <ThoughtBundleMessage key={item.id} events={item.events} agents={agents} />
                ) : (
                  <EventMessage key={item.id} event={item.event} agents={agents} />
                ),
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <footer className="border-t border-[var(--border-soft)] bg-[var(--bg-elev)]/90 px-3 py-2.5">
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-soft)] px-3 py-2">
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
                className="min-h-[54px] w-full max-w-[calc(100%-110px)] resize-none rounded-xl border border-[var(--border-soft)] bg-transparent px-3 py-2 text-[13px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-violet)]/40 transition-colors"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim() || !canInput || isPaused}
                title="发送介入"
                className="inline-flex h-10 items-center rounded-xl bg-[var(--accent-violet)] px-3.5 text-[12px] font-medium text-white transition-all hover:brightness-110 hover:shadow-[0_2px_8px_-2px_rgba(91,77,255,0.5)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none"
              >
                <Send size={14} className="mr-1" />
                发送
              </button>
            </div>
            <div className="text-[12px] text-[var(--text-muted)]">
              Enter 发送，Shift+Enter 换行。
            </div>
          </div>
        </div>
      </footer>
    </section>
  );
}
