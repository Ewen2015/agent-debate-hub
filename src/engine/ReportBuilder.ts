import type { FinalReport, Persona, RosterAgent, Source, Speech } from '@/types';
import { resolvePersona } from '@/engine/MockLLM';
import { useRosterStore } from '@/store/staticStores';

const TOPIC_SEEDS = [
  '需要在落地前完成小规模验证',
  '应建立可解释性 + 季度回顾机制',
  '建议保留人类最终介入权',
  '价值在长期而非短期 KPI',
  '先解耦高风险模块再扩展',
  '对外披露与对内治理要同步',
];

const ACTION_SEEDS = [
  '在 2 周内发起一次 4 周有限实验，明确对照组与主要指标',
  '组织一次跨职能风险评估会，覆盖合规 / 安全 / 业务三方',
  '由体验派主导产出 1 份"用户旅程影响清单"',
  '由数据极客建立指标看板与每周回看节奏',
  '由战略家出一份竞品与生态位分析',
  '由道德卫士梳理潜在伦理与公平性问题清单',
];

const groupBy = <T,>(arr: T[], key: (x: T) => string): Record<string, T[]> => {
  const out: Record<string, T[]> = {};
  for (const x of arr) {
    const k = key(x);
    if (!out[k]) out[k] = [];
    out[k].push(x);
  }
  return out;
};

const agentLookup = (): Record<string, RosterAgent> => {
  const agents = useRosterStore.getState().agents;
  const map: Record<string, RosterAgent> = {};
  for (const a of agents) map[a.id] = a;
  return map;
};

const personaName = (id: string): string => {
  if (id === 'human') return '人类主持人';
  if (id === 'system') return '系统';
  const agents = useRosterStore.getState().agents;
  const a = agents.find((x) => x.id === id);
  if (!a) return '未名';
  return resolvePersona(a).name;
};

const stanceOf = (id: string): 'pro' | 'con' | 'neutral' | 'system' => {
  if (id === 'human' || id === 'system') return 'system';
  const agents = useRosterStore.getState().agents;
  const a = agents.find((x) => x.id === id);
  if (!a) return 'neutral';
  return resolvePersona(a).stance;
};

const cluster = (speeches: Speech[]): { theme: string; speeches: Speech[] }[] => {
  const out: { theme: string; speeches: Speech[] }[] = [];
  const themes = [
    '机会与价值',
    '风险与边界',
    '用户与体验',
    '数据与证据',
    '战略与时机',
    '伦理与治理',
  ];
  const buckets: Record<string, Speech[]> = {};
  for (const t of themes) buckets[t] = [];
  for (const s of speeches) {
    const lower = s.text.toLowerCase();
    let chosen = themes[themes.length - 1];
    if (/机会|价值|愿景|增长|护城河|优势|突破|长期|杠杆/.test(lower)) chosen = themes[0];
    else if (/风险|合规|失败|安全|代价|谨慎|止损|衰减|陷阱/.test(lower)) chosen = themes[1];
    else if (/用户|体验|旅程|情感|场景|易用|故事/.test(lower)) chosen = themes[2];
    else if (/数据|统计|指标|实验|样本|置信|回归|系数/.test(lower)) chosen = themes[3];
    else if (/战略|竞品|生态|时机|博弈|格局|拐点/.test(lower)) chosen = themes[4];
    buckets[chosen].push(s);
  }
  for (const t of themes) {
    if (buckets[t].length) out.push({ theme: t, speeches: buckets[t] });
  }
  return out;
};

export const ReportBuilder = {
  build(args: {
    sessionId: string;
    question: string;
    speeches: Speech[];
  }): FinalReport {
    const { sessionId, question, speeches } = args;
    const debateSpeeches = speeches.filter((s) => s.round > 0);
    const groups = cluster(debateSpeeches);

    const arguments_ = groups.map((g) => {
      const supporters: string[] = [];
      const opposers: string[] = [];
      const evidence: Source[] = [];
      for (const sp of g.speeches) {
        const stance = stanceOf(sp.agentId);
        if (stance === 'pro') supporters.push(personaName(sp.agentId));
        else if (stance === 'con') opposers.push(personaName(sp.agentId));
        else supporters.push(personaName(sp.agentId));
        if (sp.sources) evidence.push(...sp.sources);
      }
      const dedup = (arr: string[]) => Array.from(new Set(arr));
      const dedupEv = (arr: Source[]) => {
        const seen = new Set<string>();
        const out: Source[] = [];
        for (const e of arr) {
          if (!seen.has(e.url)) {
            seen.add(e.url);
            out.push(e);
          }
        }
        return out;
      };
      return {
        id: g.theme,
        point: `${g.theme}：来自 ${g.speeches.length} 位 Agent 的核心观察`,
        supporters: dedup(supporters),
        opposers: dedup(opposers),
        evidence: dedupEv(evidence),
      };
    });

    const totalAgents = useRosterStore.getState().agents.length;
    const thresholdSupport = Math.max(1, Math.round(totalAgents * 0.55));
    const thresholdOppose = Math.max(1, Math.round(totalAgents * 0.35));

    const consensus = arguments_
      .filter((a) => a.supporters.length >= thresholdSupport && a.opposers.length === 0)
      .map((a) => a.point);

    const disagreements = arguments_
      .filter((a) => a.opposers.length >= thresholdOppose)
      .map((a) => `「${a.point}」仍被 ${a.opposers.length} 位 Agent 反对`);

    if (consensus.length === 0) {
      consensus.push('当前各论点均有反方声音，建议先收敛到 2-3 个最关键假设再决策。');
    }
    if (disagreements.length === 0 && debateSpeeches.length > 0) {
      disagreements.push('主要分歧已通过多轮辩论收敛，未出现强对抗。');
    }

    const actions = ACTION_SEEDS.slice(0, Math.min(4, totalAgents + 1));

    const tldr = `围绕「${question}」的多视角推演形成 ${consensus.length} 条共识与 ${disagreements.length} 处分歧；建议在 4 周内通过有限实验验证 ${TOPIC_SEEDS[0]}，并在治理上明确 ${TOPIC_SEEDS[2]}。`;

    return {
      sessionId,
      generatedAt: Date.now(),
      tldr,
      consensus,
      disagreements,
      actions,
      arguments: arguments_,
    };
  },

  toMarkdown(report: FinalReport, question: string): string {
    const lines: string[] = [];
    lines.push(`# 议事厅最终报告`);
    lines.push('');
    lines.push(`> 议题：${question}`);
    lines.push(`> 生成时间：${new Date(report.generatedAt).toLocaleString()}`);
    lines.push('');
    lines.push(`## TL;DR`);
    lines.push(report.tldr);
    lines.push('');
    lines.push(`## 共识点 (${report.consensus.length})`);
    report.consensus.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
    lines.push('');
    lines.push(`## 关键分歧 (${report.disagreements.length})`);
    report.disagreements.forEach((d, i) => lines.push(`${i + 1}. ${d}`));
    lines.push('');
    lines.push(`## 论点明细`);
    report.arguments.forEach((a) => {
      lines.push(`### ${a.point}`);
      lines.push(`- **支持**：${a.supporters.join('、') || '无'}`);
      lines.push(`- **反对**：${a.opposers.join('、') || '无'}`);
      if (a.evidence.length) {
        lines.push(`- **证据**：`);
        a.evidence.forEach((e) =>
          lines.push(`  - [${e.title}](${e.url}) — _${e.domain}_`),
        );
      }
      lines.push('');
    });
    lines.push(`## 行动建议`);
    report.actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push('');
    return lines.join('\n');
  },
};
