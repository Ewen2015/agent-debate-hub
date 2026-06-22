import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * 居中报告预览模态框。
 * 取代原先的右侧抽屉，让报告内容居中、宽松地展示。
 */
export function ReportModal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="glass-float rounded-2xl border border-[var(--border-soft)] w-[92vw] max-w-[1100px] max-h-[88vh] flex flex-col pointer-events-auto"
              style={{ boxShadow: 'var(--shadow-float)' }}
            >
              <header className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[var(--border-soft)]">
                <div>
                  <div className="font-display text-xl tracking-tightish text-[var(--text-primary)]">
                    Final Report
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">统一结论报告</div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-[var(--bg-card-strong)] text-[var(--text-soft)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X size={18} />
                </button>
              </header>
              <div className="flex-1 overflow-y-auto px-6 py-5 scroll-shadow">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
