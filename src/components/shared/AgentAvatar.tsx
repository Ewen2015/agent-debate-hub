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

// Apple-style system status hues — refined, slightly desaturated.
const STATUS_COLOR_LIGHT: Record<AgentStatus, string> = {
  idle: 'rgba(20, 24, 36, 0.18)',
  thinking: '#0A84FF',
  searching: '#34C759',
  speaking: '#5E5CE6',
  paused: '#FF9500',
};

const STATUS_COLOR_DARK: Record<AgentStatus, string> = {
  idle: 'rgba(255,255,255,0.18)',
  thinking: '#64D2FF',
  searching: '#30D158',
  speaking: '#8B95B8',
  paused: '#FF9F0A',
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
  const isDark = theme === 'dark';
  const map = isDark ? STATUS_COLOR_DARK : STATUS_COLOR_LIGHT;
  const ringColor = map[agent.status as AgentStatus] || map.idle;
  const showStatus = showStatusRing && agent.status !== 'idle';

  // Layered, luminous gradient — Apple app-icon feel: a soft radial light
  // bloom anchored top-left, flowing into the persona gradient.
  const surface = `
    radial-gradient(120% 120% at 28% 22%, ${c1} 0%, ${c2} 62%, ${c2} 100%)
  `;

  // Neutral, soft drop shadow (not persona-tinted) + refined inner light edge.
  const shadow = isActive
    ? `0 0 0 2px var(--accent-primary), 0 6px 18px -6px rgba(0,0,0,${isDark ? 0.6 : 0.28})`
    : `0 1px 2px rgba(0,0,0,${isDark ? 0.4 : 0.10}), 0 6px 16px -6px rgba(0,0,0,${isDark ? 0.55 : 0.22})`;

  const innerBorder = isDark
    ? 'inset 0 1px 0.5px rgba(255,255,255,0.28), inset 0 0 0 1px rgba(255,255,255,0.10)'
    : 'inset 0 1px 0.5px rgba(255,255,255,0.55), inset 0 0 0 1px rgba(255,255,255,0.14)';

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
        {/* Breathing status halo — soft, Apple-style glow instead of a hard ping. */}
        {showStatus && (
          <span
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: -Math.max(4, size * 0.1),
              background: `radial-gradient(circle, ${ringColor} 0%, transparent 68%)`,
              opacity: 0.55,
              animation: 'breathe-soft 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          />
        )}

        {/* The glass disc */}
        <div
          className="relative w-full h-full rounded-full overflow-hidden flex items-center justify-center"
          style={{
            background: surface,
            boxShadow: `${shadow}, ${innerBorder}`,
          }}
        >
          {/* Top specular sheen — soft elliptical highlight, not a hard stripe. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(140% 90% at 50% -10%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 38%, transparent 60%)',
            }}
          />
          {/* Lower ambient shading for spherical depth. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.16) 100%)',
            }}
          />
          <span
            className="relative font-display text-white"
            style={{
              fontSize: size * 0.44,
              fontWeight: 500,
              textShadow: '0 1px 1.5px rgba(0,0,0,0.22)',
            }}
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
