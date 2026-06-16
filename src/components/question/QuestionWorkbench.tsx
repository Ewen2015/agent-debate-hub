import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Send } from 'lucide-react';
import { useSessionStore } from '@/store/sessionStore';
import { pushHumanInterrupt } from '@/engine/DebateEngine';
import { Button } from '@/components/shared/Button';
import { Chip } from '@/components/shared/Chip';

export function QuestionWorkbench() {
  const question = useSessionStore((s) => s.session.question);
  const background = useSessionStore((s) => s.session.background || '');
  const setQuestion = useSessionStore((s) => s.setQuestion);
  const maxRounds = useSessionStore((s) => s.session.maxRounds);
  const setMaxRounds = useSessionStore((s) => s.setMaxRounds);
  const phase = useSessionStore((s) => s.session.phase);
  const paused = useSessionStore((s) => s.session.paused);

  const [interrupt, setInterrupt] = useState('');
  const [showBg, setShowBg] = useState(false);
  const isLive = phase === 'brainstorm' || phase === 'debate';

  const submitInterrupt = () => {
    if (!interrupt.trim()) return;
    pushHumanInterrupt(interrupt.trim());
    setInterrupt('');
  };

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="font-display text-base text-[var(--text-primary)]">议题工作台</span>
        <Chip tone="mute">question</Chip>
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
        placeholder="提出一个值得多视角推演的议题。例如：'是否应该在公司全面接入 LLM Agent 来处理客服一线？'"
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
          placeholder="附加背景资料（可选）：公司规模 / 监管环境 / 时间窗口……"
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

        <div className="h-5 w-px bg-[var(--bg-card-strong)]" />

        <div className="flex-1 min-w-[280px] flex items-center gap-2">
          <input
            value={interrupt}
            onChange={(e) => setInterrupt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitInterrupt();
              }
            }}
            placeholder={isLive ? '在任意时刻输入指令对 Agent 纠偏（Enter 发送）' : '开始后可在任意时刻介入'}
            disabled={!isLive}
            className="flex-1 bg-[var(--bg-card)] border border-[var(--border-soft)] rounded-md px-3 py-1.5
              text-sm text-[var(--text-primary)]/85 placeholder:text-[var(--text-primary)]/25 outline-none
              focus:border-[var(--accent-violet)]/50 transition-colors disabled:opacity-50"
          />
          <Button
            variant="subtle"
            size="sm"
            icon={<Send size={12} />}
            onClick={submitInterrupt}
            disabled={!isLive || !interrupt.trim()}
          >
            介入
          </Button>
        </div>
      </div>

      {!isLive && !question.trim() && (
        <div className="text-[11px] text-[var(--text-primary)]/35 tracking-widish">
          提示：在 Brainstorm 中允许"先发散后收敛"；在 Debate 中支持按立场对抗推演；报告将自动聚类全部论据。
        </div>
      )}
    </div>
  );
}
