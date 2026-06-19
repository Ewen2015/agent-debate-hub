import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useSessionStore } from '@/store/sessionStore';
import { Chip } from '@/components/shared/Chip';

export function QuestionWorkbench() {
  const question = useSessionStore((s) => s.session.question);
  const background = useSessionStore((s) => s.session.background || '');
  const setQuestion = useSessionStore((s) => s.setQuestion);
  const maxRounds = useSessionStore((s) => s.session.maxRounds);
  const setMaxRounds = useSessionStore((s) => s.setMaxRounds);
  const phase = useSessionStore((s) => s.session.phase);

  const [showBg, setShowBg] = useState(false);
  const isLive = phase === 'brainstorm' || phase === 'debate';

  return (
    <div className="glass rounded-2xl px-3 py-2 flex flex-col gap-2 text-[13px]">
      <div className="flex items-center gap-2">
        <span className="font-display text-xs text-[var(--text-primary)]">频道主题</span>
        <Chip tone="mute" size="sm">
          topic
        </Chip>
        <div className="flex-1" />
        <button
          onClick={() => setShowBg(!showBg)}
          className="text-[9px] tracking-widish uppercase text-[var(--text-primary)]/45 hover:text-[var(--text-primary)]/80 flex items-center gap-1 transition-colors"
        >
          {showBg ? '收起' : '背景'}
          {showBg ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value, background)}
        placeholder="输入讨论议题"
        rows={2}
        className="w-full bg-transparent border-b border-[var(--accent-gold)]/30 focus:border-[var(--accent-gold)] outline-none font-display text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/35 resize-none transition-colors py-1.5"
      />

      {showBg && (
        <motion.textarea
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          value={background}
          onChange={(e) => setQuestion(question, e.target.value)}
          placeholder="附加背景（可选）"
          rows={2}
          className="w-full bg-[var(--bg-card)] border border-[var(--border-soft)] rounded-2xl outline-none text-[13px] text-[var(--text-primary)]/85 placeholder:text-[var(--text-primary)]/30 px-3 py-1.5 resize-none focus:border-[var(--accent-gold)]/30 transition-colors"
        />
      )}

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-widest2 uppercase text-[var(--text-primary)]/45">
            辩论轮数
          </span>
          <div className="flex items-center gap-1">
            {[2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setMaxRounds(n)}
                disabled={isLive}
                className={`w-8 h-8 rounded-lg text-[11px] font-medium transition-colors
                  ${maxRounds === n
                    ? 'bg-[var(--accent-gold)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-card)] text-[var(--text-primary)]/65 hover:bg-[var(--bg-card-strong)] border border-[var(--border-soft)]'}
                  ${isLive ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        {!isLive && !question.trim() && (
          <div className="text-[10px] text-[var(--text-primary)]/45 tracking-widish">
            Brainstorm 先发散，Debate 按立场推进。
          </div>
        )}
      </div>
    </div>
  );
}
