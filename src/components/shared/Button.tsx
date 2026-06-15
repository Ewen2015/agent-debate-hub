import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  fullWidth?: boolean;
  type?: 'button' | 'submit';
}

const variantClass: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-gold-300 to-gold-400 text-ink-900 hover:from-gold-200 hover:to-gold-300 shadow-glow',
  secondary:
    'border border-gold-300/40 text-gold-200 hover:border-gold-300/80 hover:bg-gold-300/5',
  ghost:
    'text-cream-50/80 hover:text-cream-50 hover:bg-white/[0.04]',
  danger:
    'bg-rose-400/15 text-rose-300 border border-rose-400/30 hover:bg-rose-400/25',
  subtle:
    'bg-white/[0.04] text-cream-50/80 border border-white/10 hover:bg-white/[0.07]',
};

const sizeClass: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs tracking-widish',
  md: 'px-4 py-2 text-sm tracking-widish',
  lg: 'px-6 py-3 text-base tracking-widish',
};

export function Button({
  children,
  onClick,
  disabled,
  variant = 'secondary',
  size = 'md',
  icon,
  className = '',
  fullWidth,
  type = 'button',
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
      whileHover={disabled ? undefined : { y: -1 }}
      transition={{ duration: 0.18 }}
      className={`group inline-flex items-center justify-center gap-2 rounded-lg font-medium uppercase
        ${variantClass[variant]}
        ${sizeClass[size]}
        ${fullWidth ? 'w-full' : ''}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        transition-colors ${className}`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="whitespace-nowrap">{children}</span>
    </motion.button>
  );
}
