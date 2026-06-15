import type { Persona, RosterAgent } from '@/types';
import { resolvePersona } from '@/engine/MockLLM';
import { motion } from 'framer-motion';

interface AgentAvatarProps {
  agent: RosterAgent;
  size?: number;
  showStatusRing?: boolean;
  onClick?: () => void;
  isActive?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  idle: 'rgba(255,255,255,0.18)',
  thinking: '#E8B14C',
  searching: '#5FE0C7',
  speaking: '#9A8CFF',
  paused: '#F47174',
};

export function AgentAvatar({
  agent,
  size = 56,
  showStatusRing = true,
  onClick,
  isActive,
}: AgentAvatarProps) {
  const persona = resolvePersona(agent);
  const [c1, c2] = persona.gradient;
  const ringColor = STATUS_COLOR[agent.status] || STATUS_COLOR.idle;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.96 }}
      className={`relative inline-flex flex-col items-center group ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div
        className="relative"
        style={{ width: size, height: size }}
      >
        {showStatusRing && agent.status !== 'idle' && (
          <span
            className="absolute inset-[-6px] rounded-full pointer-events-none"
            style={{
              boxShadow: `0 0 0 1.5px ${ringColor}, 0 0 18px -2px ${ringColor}`,
            }}
          />
        )}
        {showStatusRing && agent.status !== 'idle' && (
          <span
            className="absolute inset-[-6px] rounded-full pointer-events-none"
            style={{
              boxShadow: `0 0 0 1.5px ${ringColor}`,
              animation: 'ping-soft 1.6s cubic-bezier(0,0,0.2,1) infinite',
            }}
          />
        )}
        <div
          className="relative w-full h-full rounded-full overflow-hidden flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${c1}, ${c2})`,
            boxShadow: isActive
              ? `0 0 0 2px #E8B14C, 0 6px 24px -8px ${c1}`
              : `0 6px 24px -8px ${c1}, inset 0 1px 0 rgba(255,255,255,0.15)`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-black/15 via-transparent to-white/15" />
          <span
            className="relative font-display text-cream-50"
            style={{ fontSize: size * 0.42 }}
          >
            {persona.emoji}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

export function personaGradientStyle(p: Persona): React.CSSProperties {
  return { background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})` };
}
