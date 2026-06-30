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
    'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary-soft)] shadow-[var(--shadow-primary)]',
  secondary:
    'border border-[var(--border-soft)] bg-[var(--bg-soft)] text-[var(--text-primary)] hover:bg-[var(--bg-muted)]',
  ghost:
    'text-[var(--text-soft)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-strong)]',
  danger:
    'bg-[var(--accent-rose)]/10 text-[var(--accent-rose)] border border-[var(--accent-rose)]/25 hover:bg-[var(--accent-rose)]/16 hover:border-[var(--accent-rose)]/40',
  subtle:
    'bg-[var(--bg-card-strong)] text-[var(--text-soft)] border border-[var(--border-soft)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]',
};

const sizeClass: Record<Size, string> = {
  sm: 'px-3.5 py-1.5 text-xs',
  md: 'px-5 py-2 text-sm',
  lg: 'px-6 py-2.5 text-[15px]',
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
      className={`group inline-flex items-center justify-center gap-2 rounded-full font-medium
        ${variantClass[variant]}
        ${sizeClass[size]}
        ${fullWidth ? 'w-full' : ''}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        transition-all duration-150 ${className}`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="whitespace-nowrap">{children}</span>
    </motion.button>
  );
}
