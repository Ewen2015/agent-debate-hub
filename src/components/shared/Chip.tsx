import type { ReactNode } from 'react';

type Tone = 'gold' | 'cyan' | 'rose' | 'violet' | 'neutral' | 'mute';

const toneClass: Record<Tone, string> = {
  gold: 'bg-gold-300/12 text-gold-200 border-gold-300/35',
  cyan: 'bg-cyan-400/12 text-cyan-300 border-cyan-400/35',
  rose: 'bg-rose-400/12 text-rose-300 border-rose-400/35',
  violet: 'bg-violet-400/12 text-violet-300 border-violet-400/35',
  neutral: 'bg-white/[0.06] text-cream-50/80 border-white/15',
  mute: 'bg-white/[0.03] text-cream-50/50 border-white/8',
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
