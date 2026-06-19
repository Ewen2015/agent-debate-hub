import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  side?: 'left' | 'right';
  children: ReactNode;
  width?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  side = 'right',
  children,
  width = 'w-[420px]',
}: DrawerProps) {
  return (
    <div>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />
          <motion.aside
            initial={{ x: side === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: side === 'right' ? '100%' : '-100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 280 }}
            className={`fixed top-0 ${side === 'right' ? 'right-0' : 'left-0'} h-full ${width} z-50 glass-float border-l border-[var(--border-soft)] flex flex-col`}
            style={{
              boxShadow: 'var(--shadow-float)',
            }}
          >
            <header className="flex items-start justify-between px-6 pt-6 pb-5 border-b border-[var(--border-soft)]">
              <div>
                <div className="font-display text-2xl tracking-tightish text-[var(--text-primary)]">{title}</div>
                {subtitle && (
                  <div className="text-xs text-[var(--text-muted)] mt-1.5">
                    {subtitle}
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-[var(--bg-card-strong)] text-[var(--text-soft)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X size={18} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5 scroll-shadow">
              {children}
            </div>
          </motion.aside>
        </>
      )}
    </div>
  );
}
