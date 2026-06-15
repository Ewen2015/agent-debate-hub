import { AnimatePresence, motion } from 'framer-motion';
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
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          />
          <motion.aside
            initial={{ x: side === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: side === 'right' ? '100%' : '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 240 }}
            className={`fixed top-0 ${side === 'right' ? 'right-0' : 'left-0'} h-full ${width} z-50 glass-strong border-l border-white/8 flex flex-col`}
            style={{
              boxShadow: '0 24px 80px -20px rgba(0,0,0,0.7)',
            }}
          >
            <header className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-white/8">
              <div>
                <div className="font-display text-2xl text-cream-50">{title}</div>
                {subtitle && (
                  <div className="text-xs tracking-widish uppercase text-cream-50/50 mt-1">
                    {subtitle}
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-white/8 text-cream-50/60 hover:text-cream-50 transition-colors"
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
    </AnimatePresence>
  );
}
