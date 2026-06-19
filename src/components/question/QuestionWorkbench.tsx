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
    <div className="glass rounded-lg p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="font-display text-base text-[var(--text-primary)]">频道主题</span>
        <Chip tone="mute">topic</Chip>
        <div className="flex-1" />
        <button
          onClick={() => setShowBg(!showBg)}
          className="text-[11px] tracking-widish uppercase text-[var(--text-primary)]/45 hover:text-[var(--text-primary)]/80 flex items-center gap-1 transition-colors"
        >
          {showBg ? '收起' : '附加'} 背景
          {showBg ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value, background)}
        placeholder="提出一个值得多视角推演的议题"
        rows={2}
        className="w-full bg-transparent border-b border-[var(--accent-gold)]/30 focus:border-[var(--accent-gold)] outline-none
          font-display text-lg text-[var(--text-primary)] placeholder:text-[var(--text-primary)]/25 placeholder:font-serif
          resize-none transition-colors py-2"
      />

      {showBg && (
        <motion.textarea
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          value={background}
          onChange={(e) => setQuestion(question, e.target.value)}
          placeholder="附加背景资料（可选）"
          rows={2}
          className="w-full bg-[var(--bg-card)] border border-[var(--border-soft)] rounded-lg outline-none
            text-sm text-[var(--text-primary)]/85 placeholder:text-[var(--text-primary)]/25 p-3 resize-none
            focus:border-[var(--accent-gold)]/30 transition-colors"
        />
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] tracking-widest2 uppercase text-[var(--text-primary)]/45">
            辩论轮数
          </span>
          <div className="flex items-center gap-1">
            {[2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setMaxRounds(n)}
                disabled={isLive}
                className={`w-8 h-8 rounded-md text-xs tracking-widish font-medium transition-colors
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
      </div>

      {!isLive && !question.trim() && (
        <div className="text-[11px] text-[var(--text-primary)]/35 tracking-widish">
          Brainstorm 会先发散观点，Debate 会按立场对抗推演，报告会聚类全部论据。
        </div>
      )}
    </div>
  );
}
