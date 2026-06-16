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
  title?: string;
}

const variantClass: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-[var(--accent-gold)] to-[#A8761A] text-[var(--bg-elev)] hover:brightness-110',
  secondary:
    'border border-[var(--border-strong)] text-[var(--accent-gold)] hover:bg-[var(--bg-card-strong)]',
  ghost:
    'text-[var(--text-soft)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]',
  danger:
    'bg-[var(--accent-rose)]/12 text-[var(--accent-rose)] border border-[var(--accent-rose)]/30 hover:bg-[var(--accent-rose)]/20',
  subtle:
    'bg-[var(--bg-card)] text-[var(--text-soft)] border border-[var(--border-soft)] hover:bg-[var(--bg-card-strong)]',
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
  title,
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
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
