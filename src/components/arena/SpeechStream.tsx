import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Quote } from 'lucide-react';
import { useSessionStore } from '@/store/sessionStore';
import { useRosterStore } from '@/store/staticStores';
import { resolvePersona } from '@/engine/MockLLM';
import { Chip } from '@/components/shared/Chip';
import type { AgentStance, Speech } from '@/types';

const STANCE_COLOR: Record<AgentStance, string> = {
  pro: '#B8A878',
  con: '#D08877',
  neutral: '#6FB3A8',
};

const STANCE_LABEL: Record<AgentStance, { text: string; tone: 'gold' | 'rose' | 'cyan' }> = {
  pro: { text: '支持', tone: 'gold' },
  con: { text: '反对', tone: 'rose' },
  neutral: { text: '中立', tone: 'cyan' },
};

function SpeechCard({ sp, isLast }: { sp: Speech; isLast?: boolean }) {
  const agents = useRosterStore((s) => s.agents);
  const agent = agents.find((a) => a.id === sp.agentId);
  const persona = agent ? resolvePersona(agent) : null;
  const stance = STANCE_LABEL[sp.stance];
  const [open, setOpen] = useState(isLast);
  const color = STANCE_COLOR[sp.stance];

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="glass rounded-xl p-4 relative"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <header className="flex items-center gap-3 mb-2.5">
        {persona && (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-primary)] font-display text-sm"
            style={{
              background: `linear-gradient(135deg, ${persona.gradient[0]}, ${persona.gradient[1]})`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
          >
            {persona.emoji}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm text-[var(--text-primary)] truncate">
              {persona?.name || '系统'}
            </span>
            <Chip tone={stance.tone}>{stance.text}</Chip>
            {sp.round > 0 && (
              <Chip tone="mute">R{sp.round}</Chip>
            )}
            {sp.round === 0 && (
              <Chip tone="violet">Brainstorm</Chip>
            )}
          </div>
        </div>
      </header>
      <div className="text-[13.5px] leading-relaxed text-[var(--text-primary)]/85">
        {sp.text}
      </div>
      {sp.sources && sp.sources.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setOpen(!open)}
            className="text-[11px] tracking-widish uppercase text-[var(--text-primary)]/45 hover:text-[var(--text-primary)]/80 flex items-center gap-1.5 transition-colors"
          >
            <Quote size={11} />
            引用 {sp.sources.length} 条证据
            {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          <AnimatePresence>
            {open && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 space-y-1.5 overflow-hidden"
              >
                {sp.sources.map((s) => (
                  <li
                    key={s.url}
                    className="text-[12px] text-[var(--text-primary)]/55 pl-3 border-l border-[var(--accent-cyan)]/30"
                  >
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--accent-cyan)]/85 hover:text-[var(--accent-cyan)] transition-colors"
                    >
                      {s.title}
                    </a>
                    <span className="text-[var(--text-primary)]/30 ml-1.5 text-[10px] tracking-widish uppercase">
                      {s.domain}
                    </span>
                    <div className="text-[var(--text-primary)]/40 mt-0.5 text-[11.5px] leading-snug">
                      {s.snippet}
                    </div>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.article>
  );
}

export function SpeechStream() {
  const speeches = useSessionStore((s) => s.session.speeches);
  const phase = useSessionStore((s) => s.session.phase);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [speeches.length]);

  const brainstormSpeeches = speeches.filter((s) => s.round === 0);
  const debateSpeeches = speeches.filter((s) => s.round > 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-base text-[var(--text-primary)]">发言与论据</span>
          <Chip tone="mute">{speeches.length} turns</Chip>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto pr-2 -mr-2 scroll-shadow"
      >
        {speeches.length === 0 && (
          <div className="h-full flex items-center justify-center text-[var(--text-primary)]/30 text-xs tracking-widish uppercase text-center">
            等待 Agent 发言
          </div>
        )}
        <div className="space-y-3">
          {phase !== 'debate' && phase !== 'report' && brainstormSpeeches.length > 0 && (
            <section>
              <div className="text-[10px] tracking-widest2 uppercase text-[var(--text-primary)]/40 mb-2 sticky top-0 bg-[var(--bg-elev)]/80 backdrop-blur-sm py-1.5 z-10">
                Phase 01 · Brainstorm
              </div>
              <div className="space-y-3">
                {brainstormSpeeches.map((sp, i) => (
                  <SpeechCard key={sp.id} sp={sp} isLast={i === brainstormSpeeches.length - 1} />
                ))}
              </div>
            </section>
          )}

          {debateSpeeches.length > 0 && (
            <section>
              {brainstormSpeeches.length > 0 && (
                <div className="text-[10px] tracking-widest2 uppercase text-[var(--text-primary)]/40 mb-2 sticky top-0 bg-[var(--bg-elev)]/80 backdrop-blur-sm py-1.5 z-10 mt-4">
                  Phase 02 · Debate
                </div>
              )}
              <div className="space-y-3">
                {debateSpeeches.map((sp, i) => (
                  <SpeechCard key={sp.id} sp={sp} isLast={i === debateSpeeches.length - 1} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
