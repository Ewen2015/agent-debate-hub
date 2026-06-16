import type { ReactNode } from 'react';

type Tone = 'gold' | 'cyan' | 'rose' | 'violet' | 'neutral' | 'mute';

const toneClass: Record<Tone, string> = {
  gold: 'bg-[var(--accent-gold)]/12 text-[var(--accent-gold)] border-[var(--accent-gold)]/35',
  cyan: 'bg-[var(--accent-cyan)]/12 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/35',
  rose: 'bg-[var(--accent-rose)]/12 text-[var(--accent-rose)] border-[var(--accent-rose)]/35',
  violet: 'bg-[var(--accent-violet)]/12 text-[var(--accent-violet)] border-[var(--accent-violet)]/35',
  neutral: 'bg-[var(--bg-card)] text-[var(--text-soft)] border-[var(--border-soft)]',
  mute: 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-soft)]',
};

export function Chip({
  children,
  tone = 'neutral',
  icon,
  className = '',
  size = 'sm',
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium
        ${toneClass[tone]}
        ${size === 'sm' ? 'px-2 py-0.5 text-[10px] tracking-widish' : 'px-2.5 py-1 text-xs tracking-widish'}
        ${className}`}
    >
      {icon && <span className="flex-shrink-0 opacity-90">{icon}</span>}
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
}
