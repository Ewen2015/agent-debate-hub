import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Copy, Check, ChevronDown, ChevronUp, FileText, Calendar } from 'lucide-react';
import { useSessionStore } from '@/store/sessionStore';
import { useRosterStore } from '@/store/staticStores';
import { ReportBuilder } from '@/engine/ReportBuilder';
import { Button } from '@/components/shared/Button';
import { Chip } from '@/components/shared/Chip';
import { resolvePersona } from '@/engine/MockLLM';
import type { FinalReport } from '@/types';

export function ReportPanel() {
  const report = useSessionStore((s) => s.report);
  const session = useSessionStore((s) => s.session);
  const setReport = useSessionStore((s) => s.setReport);

  const [expandedArg, setExpandedArg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const summary = report?.summary ?? '';
  const evaluation = report?.evaluation ?? [];

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-full border border-cream-50/15 flex items-center justify-center mb-3">
          <FileText size={20} className="text-[var(--text-primary)]/30" />
        </div>
        <div className="font-display text-[14px] text-[var(--text-primary)]/80">尚未生成报告</div>
        <div className="text-[11px] text-[var(--text-primary)]/40 mt-1.5 tracking-widish max-w-[260px]">
          完成至少一轮 Brainstorm 或 Debate 后，点击指挥台的「生成报告」。
        </div>
      </div>
    );
  }

  const copyToClipboard = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fallback below
      }
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      return successful;
    } catch {
      return false;
    }
  };

  const handleCopy = async () => {
    const md = ReportBuilder.toMarkdown(report, session.question);
    const success = await copyToClipboard(md);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleDownload = () => {
    const md = ReportBuilder.toMarkdown(report, session.question);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `group-debate-report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <FileText size={16} className="text-[var(--accent-gold)]" />
        <span className="font-display text-[14px] text-[var(--text-primary)]">统一结论报告</span>
      </header>

      <div className="flex items-center gap-2 text-[10px] tracking-widish uppercase text-[var(--text-primary)]/40">
        <Calendar size={10} />
        {new Date(report.generatedAt).toLocaleString()}
      </div>

      <div className="divider-x" />

      <Section title="TL;DR" index="01">
        <p className="text-[12px] leading-relaxed text-[var(--text-primary)]/90 text-balance">
          {report.tldr}
        </p>
      </Section>

      <Section title="总结与评述" index="02">
        <div className="space-y-2 text-[12px] leading-relaxed text-[var(--text-primary)]/85">
          <p>{summary}</p>
          {evaluation.map((line, idx) => (
            <p key={idx} className="text-[12.5px] text-[var(--text-primary)]/80">
              • {line}
            </p>
          ))}
        </div>
      </Section>

      <Section title="共识点" index="03" count={report.consensus.length}>
        <ul className="space-y-1.5">
          {report.consensus.map((c, i) => (
            <li
              key={i}
              className="text-[12px] leading-relaxed text-[var(--text-primary)]/85 pl-3 border-l-2 border-[var(--accent-gold)]/40"
            >
              {c}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="关键分歧" index="03" count={report.disagreements.length}>
        <ul className="space-y-1.5">
          {report.disagreements.map((d, i) => (
            <li
              key={i}
              className="text-[12px] leading-relaxed text-[var(--text-primary)]/85 pl-3 border-l-2 border-[var(--accent-rose)]/40"
            >
              {d}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="论点明细" index="04" count={report.arguments.length}>
        <div className="space-y-2">
          {report.arguments.map((a) => {
            const open = expandedArg === a.id;
            return (
              <div key={a.id} className="glass rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedArg(open ? null : a.id)}
                  className="w-full px-3 py-2 flex items-center gap-2 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-[14px] text-[var(--text-primary)] truncate">
                      {a.point}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {a.supporters.length > 0 && (
                        <Chip tone="gold" size="sm">{a.supporters.length} 支持</Chip>
                      )}
                      {a.opposers.length > 0 && (
                        <Chip tone="rose" size="sm">{a.opposers.length} 反对</Chip>
                      )}
                      {a.evidence.length > 0 && (
                        <Chip tone="cyan" size="sm">{a.evidence.length} 证据</Chip>
                      )}
                    </div>
                  </div>
                  {open ? <ChevronUp size={14} className="text-[var(--text-primary)]/50" /> : <ChevronDown size={14} className="text-[var(--text-primary)]/50" />}
                </button>
                <AnimatePresence>
                  {open && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-[var(--border-soft)] px-3 py-2.5 space-y-2 overflow-hidden"
                    >
                      {a.supporters.length > 0 && (
                        <div>
                          <div className="text-[10px] tracking-widish uppercase text-[var(--accent-gold)]/70 mb-1">支持</div>
                          <div className="text-[12px] text-[var(--text-primary)]/75">{a.supporters.join('、')}</div>
                        </div>
                      )}
                      {a.opposers.length > 0 && (
                        <div>
                          <div className="text-[10px] tracking-widish uppercase text-[var(--accent-rose)]/70 mb-1">反对</div>
                          <div className="text-[12px] text-[var(--text-primary)]/75">{a.opposers.join('、')}</div>
                        </div>
                      )}
                      {a.evidence.length > 0 && (
                        <div>
                          <div className="text-[10px] tracking-widish uppercase text-[var(--accent-cyan)]/70 mb-1">证据</div>
                          <ul className="space-y-1">
                            {a.evidence.map((e) => (
                              <li
                                key={e.url}
                                className="text-[12px] pl-2 border-l border-[var(--accent-cyan)]/30"
                              >
                                <a
                                  href={e.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[var(--accent-cyan)]/85 hover:text-[var(--accent-cyan)]"
                                >
                                  {e.title}
                                </a>
                                <span className="text-[var(--text-primary)]/30 ml-1.5 text-[10px] tracking-widish uppercase">
                                  {e.domain}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="行动建议" index="05" count={report.actions.length}>
        <ol className="space-y-1.5 list-decimal list-inside">
          {report.actions.map((a, i) => (
            <li
              key={i}
              className="text-[12px] leading-relaxed text-[var(--text-primary)]/85 marker:text-[var(--accent-gold)] marker:font-mono"
            >
              {a}
            </li>
          ))}
        </ol>
      </Section>

      <div className="flex gap-2 pt-2">
        <Button
          variant="primary"
          size="sm"
          icon={<Download size={13} />}
          onClick={handleDownload}
        >
          导出 Markdown
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={copied ? <Check size={13} /> : <Copy size={13} />}
          onClick={handleCopy}
        >
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  index,
  count,
  children,
}: {
  title: string;
  index: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2.5">
        <span className="font-mono text-[10px] text-[var(--accent-gold)]/70 tracking-widish">
          {index}
        </span>
        <span className="font-display text-[14px] text-[var(--text-primary)]">{title}</span>
        {count !== undefined && (
          <span className="text-[10px] text-[var(--text-primary)]/40 ml-1">({count})</span>
        )}
        <div className="flex-1 h-px bg-[var(--bg-card)] ml-2" />
      </div>
      {children}
    </section>
  );
}
