import { ArgumentEvolutionGraph } from '@/components/report/ArgumentEvolutionGraph';
import type { FinalReport, RosterAgent, Speech } from '@/types';

/**
 * 打印专用视图：作为 window.print() 的目标。
 * 屏幕上隐藏（由 globals.css 的 @media print 控制），仅打印时可见。
 * 始终挂载在 DOM 中（report 存在时），保证打印内容完整。
 */
export function ReportPrintView({
  report,
  question,
  speeches,
  agents,
}: {
  report: FinalReport;
  question: string;
  speeches: Speech[];
  agents: RosterAgent[];
}) {
  return (
    <div id="report-print-root" className="hidden print:block">
      <h1 className="report-h1">议事厅最终报告</h1>
      <div className="report-meta">议题：{question}</div>
      <div className="report-meta">
        生成时间：{new Date(report.generatedAt).toLocaleString()}
      </div>

      <h2 className="report-h2">TL;DR</h2>
      <p className="report-p">{report.tldr}</p>

      <h2 className="report-h2">总结与评述</h2>
      <p className="report-p">{report.summary}</p>
      {report.evaluation.map((line, i) => (
        <p className="report-p" key={i}>
          • {line}
        </p>
      ))}

      <h2 className="report-h2">共识点（{report.consensus.length}）</h2>
      <ol className="report-ol">
        {report.consensus.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ol>

      <h2 className="report-h2">关键分歧（{report.disagreements.length}）</h2>
      <ol className="report-ol">
        {report.disagreements.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ol>

      <h2 className="report-h2">论点明细</h2>
      {report.arguments.map((a) => (
        <div className="report-arg" key={a.id}>
          <h3 className="report-h3">{a.point}</h3>
          <p className="report-p">
            支持：{a.supporters.join('、') || '无'}　|　反对：
            {a.opposers.join('、') || '无'}
          </p>
          {a.evidence.length > 0 && (
            <ul className="report-ul">
              {a.evidence.map((e) => (
                <li key={e.url}>
                  {e.title}（{e.domain}）
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <h2 className="report-h2">辩论观点演进图</h2>
      {speeches.length > 0 ? (
        <ArgumentEvolutionGraph
          roundSummaries={report.roundSummaries}
          speeches={speeches}
          agents={agents}
        />
      ) : (
        <p className="report-p">暂无发言数据。</p>
      )}

      <h2 className="report-h2">行动建议</h2>
      <ol className="report-ol">
        {report.actions.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ol>
    </div>
  );
}
