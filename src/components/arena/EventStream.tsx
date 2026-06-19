import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Search, MessageSquare, BookOpenCheck, Sparkles, AlertTriangle,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { useSessionStore } from '@/store/sessionStore';
import { useRosterStore } from '@/store/staticStores';
import { resolvePersona } from '@/engine/MockLLM';
import { Chip } from '@/components/shared/Chip';
import type { DebateEvent } from '@/types';

const fmt = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

const typeMeta = (type: DebateEvent['type']) => {
  switch (type) {
    case 'think':
      return { icon: <Brain size={12} />, label: '思考', tone: 'gold' as const };
    case 'speak':
      return { icon: <MessageSquare size={12} />, label: '发言', tone: 'violet' as const };
    case 'search':
      return { icon: <Search size={12} />, label: '检索', tone: 'cyan' as const };
    case 'cite':
      return { icon: <BookOpenCheck size={12} />, label: '引用', tone: 'cyan' as const };
    case 'interrupt':
      return { icon: <AlertTriangle size={12} />, label: '人类介入', tone: 'rose' as const };
    case 'system':
      return { icon: <Sparkles size={12} />, label: '系统', tone: 'mute' as const };
  }
};

const LONG = 90;

function EventRow({ e }: { e: DebateEvent }) {
  const meta = typeMeta(e.type);
  const isSystem = e.agentId === 'system' || e.agentId === 'human';
  const isLong = (e.payload.text?.length || 0) > LONG;
  const [expanded, setExpanded] = useState(!isLong);
  const lookupName = (id: string) => {
    if (id === 'human') return '人类主持人';
    if (id === 'system') return '系统';
    const a = useRosterStore.getState().agents.find((x) => x.id === id);
    if (!a) return '未知';
    return resolvePersona(a).name;
  };
  const isThink = e.type === 'think';
  const isSearch = e.type === 'search' || e.type === 'cite';
  return (
    <motion.li
      initial={{ opacity: 0, x: -8, height: 0 }}
      animate={{ opacity: 1, x: 0, height: 'auto' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="flex items-start gap-2 text-[12px] leading-relaxed py-0.5"
    >
      <span className="font-mono text-[var(--text-primary)]/30 w-[60px] flex-shrink-0 pt-0.5">
        {fmt(e.ts)}
      </span>
      <Chip
        tone={isSystem && e.agentId === 'human' ? 'rose' : meta.tone}
        className="flex-shrink-0"
      >
        {meta.icon}
        {meta.label}
      </Chip>
      <div className="text-[var(--text-primary)]/70 flex-1 min-w-0">
        <div className="text-[var(--text-primary)]/90">
          {lookupName(e.agentId)}
          {e.payload.subText ? (
            <span className="text-[var(--text-primary)]/40 ml-1">· {e.payload.subText}</span>
          ) : null}
        </div>
        {e.payload.text ? (
          <div
            className={`mt-0.5 ${
              isThink
                ? 'font-mono text-[11.5px] text-[var(--accent-gold)]/80 border-l-2 border-[var(--accent-gold)]/30 pl-2'
                : isSearch
                ? 'text-[var(--accent-cyan)]/85'
                : 'text-[var(--text-primary)]/75'
            } ${!expanded && isLong ? 'line-clamp-2' : 'whitespace-pre-wrap'}`}
          >
            {e.payload.text}
          </div>
        ) : null}
        {e.payload.sources && e.payload.sources.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {e.payload.sources.map((s) => (
              <li key={s.url} className="text-[11px] text-[var(--text-primary)]/50 pl-2 border-l border-[var(--accent-cyan)]/25">
                <a className="text-[var(--accent-cyan)]/85 hover:text-[var(--accent-cyan)]" href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
                <span className="text-[var(--text-primary)]/30 ml-1.5 text-[10px] tracking-widish uppercase">{s.domain}</span>
              </li>
            ))}
          </ul>
        )}
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] tracking-widish uppercase text-[var(--text-primary)]/40 hover:text-[var(--text-primary)]/80 mt-0.5 flex items-center gap-1"
          >
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {expanded ? '折叠' : '展开'}
          </button>
        )}
      </div>
    </motion.li>
  );
}

export function EventStream() {
  const events = useSessionStore((s) => s.session.events);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-base text-[var(--text-primary)]">实时事件流</span>
          <Chip tone="mute">live</Chip>
        </div>
        <span className="text-[10px] text-[var(--text-primary)]/40 tracking-widish uppercase">
          {events.length} events
        </span>
      </div>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto pr-2 -mr-2 scroll-shadow"
      >
        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {events.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </AnimatePresence>
          {events.length === 0 && (
            <li className="text-[var(--text-primary)]/30 text-xs tracking-widish uppercase text-center py-6">
              等待开始
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
