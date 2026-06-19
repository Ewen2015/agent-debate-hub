import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useSessionStore } from '@/store/sessionStore';

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
    <div className="relative glass rounded-2xl px-3 py-2 flex items-center gap-3 text-[13px]">
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => setShowBg(!showBg)}
          title="附加背景"
          className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
            showBg ? 'bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-strong)]'
          }`}
        >
          {showBg ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value, background)}
        placeholder="输入讨论议题…"
        rows={1}
        className="flex-1 min-w-0 bg-transparent border-b border-[var(--accent-gold)]/25 focus:border-[var(--accent-gold)] outline-none font-display text-[14px] tracking-tightish text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none transition-colors py-0.5 leading-relaxed"
      />

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {[2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setMaxRounds(n)}
            disabled={isLive}
            title={`${n} 轮辩论`}
            className={`w-6 h-6 rounded-md text-[11px] font-medium transition-all
              ${maxRounds === n
                ? 'bg-[var(--accent-gold)] text-white shadow-[0_1px_3px_-1px_rgba(168,118,26,0.5)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-strong)]'}
              ${isLive ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {n}
          </button>
        ))}
      </div>

      {showBg && (
        <motion.textarea
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          value={background}
          onChange={(e) => setQuestion(question, e.target.value)}
          placeholder="附加背景（可选）"
          rows={2}
          className="absolute left-3 right-3 top-full mt-1 w-[calc(100%-1.5rem)] bg-[var(--bg-elev)] border border-[var(--border-soft)] rounded-xl outline-none text-[12px] text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] px-3 py-2 resize-none focus:border-[var(--accent-gold)]/40 transition-colors shadow-float z-20"
        />
      )}
    </div>
  );
}
