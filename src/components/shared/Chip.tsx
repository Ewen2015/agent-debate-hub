import type { ReactNode } from 'react';

type Tone = 'primary' | 'violet' | 'emerald' | 'rose' | 'amber' | 'neutral' | 'mute';

const toneClass: Record<Tone, string> = {
  primary: 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border-[var(--accent-primary)]/20',
  violet: 'bg-[var(--accent-violet)]/10 text-[var(--accent-violet)] border-[var(--accent-violet)]/20',
  emerald: 'bg-[var(--accent-emerald)]/12 text-[var(--accent-emerald)] border-[var(--accent-emerald)]/22',
  rose: 'bg-[var(--accent-rose)]/10 text-[var(--accent-rose)] border-[var(--accent-rose)]/20',
  amber: 'bg-[var(--accent-amber)]/12 text-[var(--accent-amber)] border-[var(--accent-amber)]/22',
  neutral: 'bg-[var(--bg-card-strong)] text-[var(--text-soft)] border-[var(--border-soft)]',
  mute: 'bg-[var(--bg-card-strong)] text-[var(--text-muted)] border-[var(--border-soft)]',
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
        ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}
        ${className}`}
    >
      {icon && <span className="flex-shrink-0 opacity-90">{icon}</span>}
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
}
