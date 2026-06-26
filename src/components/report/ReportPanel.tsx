import { useState } from 'react';
import { Download, Copy, Check, FileText, Calendar, FileDown, Code2 } from 'lucide-react';
import { useSessionStore } from '@/store/sessionStore';
import { useRosterStore } from '@/store/staticStores';
import { ReportBuilder } from '@/engine/ReportBuilder';
import { Button } from '@/components/shared/Button';
import { Chip } from '@/components/shared/Chip';
import { ArgumentEvolutionGraph } from '@/components/report/ArgumentEvolutionGraph';
import { ConvergenceCurve } from '@/components/report/ConvergenceCurve';
import { Markdown } from '@/components/shared/Markdown';

export function ReportPanel() {
  const report = useSessionStore((s) => s.report);
  const session = useSessionStore((s) => s.session);
  const agents = useRosterStore((s) => s.agents);

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

  const handleDownloadHTML = () => {
    const html = ReportBuilder.toHTML(report, session.question);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `group-debate-report-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 通过浏览器打印对话框导出 PDF（ReportPrintView 已挂载，打印样式表会隔离内容）
  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <FileText size={16} className="text-[var(--accent-primary)]" />
        <span className="font-display text-[14px] text-[var(--text-primary)]">统一结论报告</span>
      </header>

      <div className="flex items-center gap-2 text-[10px] tracking-widish uppercase text-[var(--text-primary)]/40">
        <Calendar size={10} />
        {new Date(report.generatedAt).toLocaleString()}
      </div>

      <div className="divider-x" />

      <Section title="TL;DR" index="01">
        <Markdown className="text-[12px] leading-relaxed text-[var(--text-primary)]/90">
          {report.tldr}
        </Markdown>
        {report.tldrMeta && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Chip tone="primary" size="sm">{report.tldrMeta.model || '未指定模型'}</Chip>
            <Chip tone="neutral" size="sm">{report.tldrMeta.agentCount} 位角色</Chip>
            <Chip tone="neutral" size="sm">{report.tldrMeta.roundCount} 轮辩论</Chip>
            <Chip tone="neutral" size="sm">用时 {report.tldrMeta.duration}</Chip>
            {report.tldrMeta.convergence && (
              <Chip tone="emerald" size="sm">
                收敛 {(report.tldrMeta.convergence.from * 100).toFixed(0)}%→{(report.tldrMeta.convergence.to * 100).toFixed(0)}%（{report.tldrMeta.convergence.trend}）
              </Chip>
            )}
          </div>
        )}
      </Section>

      <Section title="总结与评述" index="02">
        <div className="space-y-2 text-[12px] leading-relaxed text-[var(--text-primary)]/85">
          <Markdown>{summary}</Markdown>
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
              className="text-[12px] leading-relaxed text-[var(--text-primary)]/85 pl-3 border-l-2 border-[var(--accent-primary)]/40"
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

      <Section title="议题收敛曲线" index="04">
        <ConvergenceCurve rounds={report?.roundSummaries ?? session.roundSummaries} />
      </Section>

      <Section title="行动建议" index="05" count={report.actions.length}>
        <ol className="space-y-1.5 list-decimal list-inside">
          {report.actions.map((a, i) => (
            <li
              key={i}
              className="text-[12px] leading-relaxed text-[var(--text-primary)]/85 marker:text-[var(--accent-primary)] marker:font-mono"
            >
              {a}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="辩论观点演进图" index="06">
        <ArgumentEvolutionGraph
          roundSummaries={report?.roundSummaries ?? session.roundSummaries}
          speeches={session.speeches}
          agents={agents}
        />
      </Section>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button
          variant="primary"
          size="sm"
          icon={<FileDown size={13} />}
          onClick={handleExportPDF}
        >
          导出 PDF
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Download size={13} />}
          onClick={handleDownload}
        >
          导出 Markdown
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Code2 size={13} />}
          onClick={handleDownloadHTML}
        >
          导出 HTML
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

      {/* 打印专用视图由 App 层 portal 挂载到 body，避免被模态框裁剪 */}
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
        <span className="font-mono text-[10px] text-[var(--accent-primary)]/70 tracking-widish">
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
