import { useRosterStore } from '@/store/staticStores';
import { AgentAvatar } from '@/components/shared/AgentAvatar';
import { Chip } from '@/components/shared/Chip';
import { resolvePersona } from '@/engine/MockLLM';
import { motion } from 'framer-motion';

const STATUS_LABEL: Record<string, { text: string; tone: 'primary' | 'emerald' | 'rose' | 'violet' | 'neutral' }> = {
  idle: { text: '待命', tone: 'neutral' },
  thinking: { text: '思考中', tone: 'primary' },
  searching: { text: '检索中', tone: 'emerald' },
  speaking: { text: '发言中', tone: 'violet' },
  paused: { text: '已暂停', tone: 'rose' },
};

const STANCE_LABEL: Record<string, { text: string; tone: 'primary' | 'emerald' | 'rose' | 'violet' | 'neutral' }> = {
  pro: { text: '支持', tone: 'primary' },
  con: { text: '反对', tone: 'rose' },
  neutral: { text: '中立', tone: 'emerald' },
};

export function AgentRing() {
  const agents = useRosterStore((s) => s.agents);

  return (
    <div className="relative w-full h-full min-h-[280px] flex items-center justify-center">
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-50"
        viewBox="0 0 800 400"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,113,227,0.16)" />
            <stop offset="60%" stopColor="rgba(0,113,227,0.04)" />
            <stop offset="100%" stopColor="rgba(0,113,227,0)" />
          </radialGradient>
          <linearGradient id="arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(0,113,227,0)" />
            <stop offset="50%" stopColor="rgba(175,82,222,0.5)" />
            <stop offset="100%" stopColor="rgba(0,113,227,0)" />
          </linearGradient>
        </defs>
        <ellipse cx="400" cy="200" rx="360" ry="140" fill="url(#halo)" />
        <path
          d="M 60 220 Q 400 30 740 220"
          fill="none"
          stroke="url(#arc)"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
      </svg>

      <div className="relative w-full max-w-[860px] grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-x-6 gap-y-8 px-6">
        {agents.map((agent, i) => {
          const persona = resolvePersona(agent);
          const status = STATUS_LABEL[agent.status];
          const stance = STANCE_LABEL[persona.stance];

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.4 }}
              className="flex flex-col items-center gap-2 group"
            >
              <AgentAvatar agent={agent} size={64} />
              <div className="text-center">
                <div className="font-display text-sm text-[var(--text-primary)] leading-tight">
                  {persona.name}
                </div>
                <div className="text-[10px] text-[var(--text-primary)]/45 tracking-widish uppercase mt-0.5 truncate max-w-[120px]">
                  {persona.oneLiner}
                </div>
                <div className="flex items-center justify-center gap-1 mt-1.5">
                  <Chip tone={stance.tone}>{stance.text}</Chip>
                  <Chip tone={status.tone}>{status.text}</Chip>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
