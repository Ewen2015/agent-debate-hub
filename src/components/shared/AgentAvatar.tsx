import type { Persona, RosterAgent, AgentStatus } from '@/types';
import { resolvePersona } from '@/engine/MockLLM';
import { motion } from 'framer-motion';
import { useThemeStore } from '@/store/themeStore';

interface AgentAvatarProps {
  agent: RosterAgent;
  size?: number;
  showStatusRing?: boolean;
  onClick?: () => void;
  isActive?: boolean;
}

const STATUS_COLOR_LIGHT: Record<AgentStatus, string> = {
  idle: 'rgba(20, 24, 36, 0.18)',
  thinking: '#B8801E',
  searching: '#2BA88E',
  speaking: '#7565D6',
  paused: '#C84A4D',
};

const STATUS_COLOR_DARK: Record<AgentStatus, string> = {
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
  const theme = useThemeStore((s) => s.theme);
  const map = theme === 'dark' ? STATUS_COLOR_DARK : STATUS_COLOR_LIGHT;
  const ringColor = map[agent.status as AgentStatus] || map.idle;
  const activeColor = theme === 'dark' ? '#E8B14C' : '#B8801E';
  const overlayLight = theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.35)';

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
              ? `0 0 0 2px ${activeColor}, 0 6px 24px -8px ${c1}`
              : `0 6px 24px -8px ${c1}, inset 0 1px 0 ${overlayLight}`,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, rgba(0,0,0,0.12), transparent 50%, rgba(255,255,255,0.18))',
            }}
          />
          <span
            className="relative font-display text-white"
            style={{ fontSize: size * 0.42, textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}
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
