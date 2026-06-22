import { useMemo } from 'react';
import { useRosterStore } from '@/store/staticStores';
import { resolvePersona } from '@/engine/MockLLM';
import type { AgentStance, RosterAgent, RoundSummary, RoundViewpoint, Speech } from '@/types';

/**
 * 辩论观点演进图 —— 三栏（多栏）演进视图。
 *
 * 设计目标（用户友好优先）：
 *  - 观点准确简洁：直接消费每轮「系统总结」产出的 RoundSummary
 *    （DebateEngine 在每轮后由 LLM 总结），而非对全文正则硬剥。
 *  - 字号与正文一致（13px 观点 / 11px 署名），跟随主题变量，可读、可复制。
 *  - 从左到右按轮次铺开，无需缩放/平移；列内顶部本轮总结，下方每位 Agent 一句话观点。
 *  - 历史数据兜底：无 RoundSummary 时按 speeches 分组降级渲染。
 */

const STANCE_FILL: Record<AgentStance, string> = {
  pro: '#B8A878',
  con: '#D08877',
  neutral: '#6FB3A8',
};
const STANCE_LABEL: Record<AgentStance, string> = {
  pro: '支持',
  con: '反对',
  neutral: '中立',
};

interface Column {
  round: number;
  title: string;
  digest: string;
  viewpoints: RoundViewpoint[];
}

/** 从 speeches 降级生成 Column（历史数据 / 无系统总结时） */
function columnsFromSpeeches(speeches: Speech[], agents: RosterAgent[]): Column[] {
  const nameOf = (id: string) => {
    const a = agents.find((x) => x.id === id);
    return a ? resolvePersona(a).name : 'Agent';
  };
  const byRound = new Map<number, Speech[]>();
  for (const s of speeches) {
    if (!byRound.has(s.round)) byRound.set(s.round, []);
    byRound.get(s.round)!.push(s);
  }
  return [...byRound.keys()].sort((a, b) => a - b).map((round) => {
    const list = byRound.get(round)!;
    return {
      round,
      title: round === 0 ? 'Brainstorm' : `第 ${round} 轮`,
      digest: `${round === 0 ? 'Brainstorm' : `第 ${round} 轮`} · 共 ${list.length} 位发言者`,
      viewpoints: list.map<RoundViewpoint>((sp) => {
        const t = (sp.text || '').replace(/\s+/g, ' ').trim();
        const v = t.length > 30 ? t.slice(0, 30) + '…' : t;
        return {
          agentId: sp.agentId,
          name: nameOf(sp.agentId),
          stance: sp.stance,
          viewpoint: v || '（无观点）',
          evidenceCount: sp.sources?.length ?? 0,
        };
      }),
    };
  });
}

export function ArgumentEvolutionGraph({
  roundSummaries,
  speeches,
  agents,
}: {
  roundSummaries?: RoundSummary[];
  speeches: Speech[];
  agents: RosterAgent[];
}) {
  const roster = useRosterStore((s) => s.agents);
  const allAgents = agents.length ? agents : roster;

  const columns = useMemo<Column[]>(() => {
    if (roundSummaries && roundSummaries.length) {
      return roundSummaries.map((rs) => ({
        round: rs.round,
        title: rs.title || (rs.round === 0 ? 'Brainstorm' : `第 ${rs.round} 轮`),
        digest: rs.digest,
        viewpoints: rs.viewpoints,
      }));
    }
    return columnsFromSpeeches(speeches, allAgents);
  }, [roundSummaries, speeches, allAgents]);

  if (columns.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-[var(--border-soft)] text-[12px] text-[var(--text-muted)]">
        暂无发言数据，无法生成演进图。
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--bg-soft)] overflow-hidden">
      {/* 图例工具条 */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--border-soft)] bg-[var(--bg-card-soft)] text-[10px] text-[var(--text-muted)]">
        <Legend color={STANCE_FILL.pro} label="支持" />
        <Legend color={STANCE_FILL.con} label="反对" />
        <Legend color={STANCE_FILL.neutral} label="中立" />
        <span className="ml-1 hidden sm:inline">从左到右：观点按轮次演进</span>
        {columns.length > 1 && (
          <span className="ml-auto text-[var(--accent-cyan)]/70">← 横向滑动查看全部 {columns.length} 轮 →</span>
        )}
      </div>

      {/* 三栏演进：横向滚动，每轮一列 */}
      <div className="overflow-x-auto evo-scroll">
        <div className="flex gap-3 p-3 min-w-min evo-row">
          {columns.map((col) => (
            <RoundColumn key={col.round} column={col} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RoundColumn({ column }: { column: Column }) {
  return (
    <div className="w-[260px] shrink-0 flex flex-col gap-2 evo-col">
      {/* 列头 */}
      <div className="flex items-center gap-2 px-1">
        <span className="font-display text-[13px] text-[var(--text-primary)]">{column.title}</span>
        <span className="text-[10px] text-[var(--text-muted)]">· {column.viewpoints.length} 位</span>
      </div>

      {/* 本轮总结 */}
      <div className="rounded-md bg-[var(--bg-card-soft)] border border-[var(--border-soft)] px-2.5 py-2">
        <div className="text-[9px] tracking-widish uppercase text-[var(--accent-gold)]/70 mb-1">
          本轮总结
        </div>
        <div className="text-[12px] leading-[19px] text-[var(--text-primary)]/85 break-words">
          {column.digest}
        </div>
      </div>

      {/* 各 Agent 观点卡片 */}
      <div className="flex flex-col gap-1.5">
        {column.viewpoints.map((v) => (
          <ViewpointCard key={v.agentId + v.name} v={v} />
        ))}
      </div>
    </div>
  );
}

function ViewpointCard({ v }: { v: RoundViewpoint }) {
  const color = STANCE_FILL[v.stance] ?? STANCE_FILL.neutral;
  return (
    <div className="relative rounded-md bg-[var(--bg-card-soft)] border border-[var(--border-soft)] pl-3 pr-2.5 py-2">
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: color }}
      />
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] font-medium text-[var(--text-primary)]/70 min-w-0 truncate">
          {v.name}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] shrink-0">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: color }}
          />
          {STANCE_LABEL[v.stance]}
        </span>
      </div>
      <div className="text-[13px] leading-[20px] text-[var(--text-primary)] break-words">
        {v.viewpoint}
      </div>
      {v.evidenceCount > 0 && (
        <div className="mt-1 text-[10px] text-[var(--accent-cyan)]/80">
          引用 {v.evidenceCount} 条证据
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

export default ArgumentEvolutionGraph;
